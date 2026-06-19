package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ferry/backend/internal/auth"
	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/bandmirror"
	"github.com/ferry/backend/internal/config"
	"github.com/ferry/backend/internal/db"
	ferrypkg "github.com/ferry/backend/internal/ferry"
	ghpkg "github.com/ferry/backend/internal/github"
	"github.com/ferry/backend/internal/http/middleware"
	migratepkg "github.com/ferry/backend/internal/migrate"
	runspkg "github.com/ferry/backend/internal/runs"
	"github.com/ferry/backend/internal/scheduler"
	"github.com/ferry/backend/internal/storage"
	"github.com/ferry/backend/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	pool, err := connectDB(cfg)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	if err := migratepkg.Run(context.Background(), pool, migrations.FS); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}

	rdb := connectRedis(cfg)
	defer rdb.Close()

	queries := db.New(pool)

	jwtManager := auth.NewJWTManager(
		cfg.JWT.Secret,
		cfg.JWT.Secret,
		cfg.JWT.AccessExpiry,
		cfg.JWT.RefreshExpiry,
		"ferry",
	)
	hasher := auth.NewPasswordHasher()
	authService := auth.NewService(queries, jwtManager, hasher)

	ghHandler := auth.NewGitHubHandler(auth.GitHubOAuthConfig{
		ClientID:     cfg.GitHub.ClientID,
		ClientSecret: cfg.GitHub.ClientSecret,
		RedirectURI:  cfg.GitHub.RedirectURI,
		FrontendURL:  cfg.Server.FrontendURL,
	}, authService, rdb)

	authMiddleware := middleware.NewAuthMiddleware(authService)

	ghApp, err := ghpkg.NewApp(cfg.GitHub.AppID, cfg.GitHub.AppSlug, cfg.GitHub.AppPrivateKey)
	if err != nil {
		log.Fatalf("github app configuration failed: %v", err)
	} else if ghApp != nil {
		log.Printf("github app enabled (id %s)", cfg.GitHub.AppID)
	}
	ghTokens := ghpkg.NewUserTokens(rdb, cfg.GitHub.ClientID, cfg.GitHub.ClientSecret, cfg.GitHub.PAT)
	ghAPIHandler := ghpkg.NewHandler(ghTokens, ghApp)

	bandService, err := band.NewService(&cfg.Band)
	if err != nil {
		log.Fatalf("failed to init band service: %v", err)
	}

	// Run scheduler: admits up to N concurrent runs (N = provider key-pool size),
	// queues the rest in Redis, and admits queued runs as slots free.
	sched := scheduler.New(pool, queries, rdb, bandService, cfg.Agents.Slots(), 0)
	go sched.Run(context.Background())
	log.Printf("run scheduler: %d concurrency slot(s)", cfg.Agents.Slots())

	// Optional MinIO storage for generated files (best-effort: if it can't be
	// reached, artifacts still surface via the inline DB preview).
	var artifactStore *storage.MinIOClient
	if store, err := storage.NewMinIOClient(cfg.MinIO.Endpoint, cfg.MinIO.AccessKey, cfg.MinIO.SecretKey, cfg.MinIO.BucketArtifacts, cfg.MinIO.UseSSL); err != nil {
		log.Printf("minio: artifact storage disabled: %v", err)
	} else if err := store.EnsureBucket(context.Background()); err != nil {
		log.Printf("minio: ensure bucket failed, artifact storage disabled: %v", err)
	} else {
		artifactStore = store
	}

	runsHandler := runspkg.NewHandler(pool, queries, rdb, authService, bandService, sched, artifactStore)
	ferryHandler := ferrypkg.NewHandler(pool, queries, bandService, cfg.Agents, sched)

	// Mirror Band chat transcripts into agent_messages + Redis so the run
	// timeline + SSE surface the agent collaboration in the frontend.
	if mirror := bandmirror.New(pool, rdb, cfg, artifactStore); mirror != nil {
		go mirror.Run(context.Background())
	}

	mux := http.NewServeMux()

	// Public routes
	mux.HandleFunc("/", handleRoot)
	mux.HandleFunc("/health", handleHealth(cfg))
	mux.HandleFunc("/auth/github", ghHandler.HandleBegin)
	mux.HandleFunc("/auth/github/callback", ghHandler.HandleCallback)
	mux.HandleFunc("/auth/github/setup", ghHandler.HandleSetup)

	// Token refresh — public (authenticates via the refresh token), lets the
	// frontend recover an expired 15m access token without forcing re-login.
	authHTTPHandler := auth.NewHTTPHandler(authService)
	mux.HandleFunc("POST /api/auth/refresh", authHTTPHandler.HandleRefresh)

	// Protected routes
	mux.Handle("/api/github/repos/resolve", authMiddleware.Authenticate(
		http.HandlerFunc(ghAPIHandler.ResolveRepo),
	))
	mux.Handle("/api/github/repos/suggestions", authMiddleware.Authenticate(
		http.HandlerFunc(ghAPIHandler.ListSuggestions),
	))
	mux.Handle("/api/github/app/installation", authMiddleware.Authenticate(
		http.HandlerFunc(ghAPIHandler.AppInstallation),
	))

	// Runs routes
	mux.Handle("GET /api/runs", authMiddleware.Authenticate(http.HandlerFunc(runsHandler.ListRuns)))
	mux.Handle("POST /api/runs", authMiddleware.Authenticate(http.HandlerFunc(runsHandler.CreateRun)))
	mux.Handle("GET /api/runs/{id}", authMiddleware.Authenticate(http.HandlerFunc(runsHandler.GetRun)))
	mux.Handle("POST /api/runs/{id}/start", authMiddleware.Authenticate(http.HandlerFunc(runsHandler.StartRun)))
	mux.Handle("POST /api/runs/{id}/cancel", authMiddleware.Authenticate(http.HandlerFunc(runsHandler.CancelRun)))
	mux.Handle("POST /api/runs/{id}/rerun", authMiddleware.Authenticate(http.HandlerFunc(runsHandler.RerunRun)))
	mux.Handle("POST /api/runs/{id}/db-plan/approve", authMiddleware.Authenticate(http.HandlerFunc(runsHandler.ApproveDbPlan)))
	mux.Handle("GET /api/runs/{id}/artifacts/{artifactId}", authMiddleware.Authenticate(http.HandlerFunc(runsHandler.GetArtifactContent)))
	// SSE: auth handled inside handler (EventSource can't set headers, token via query param)
	mux.HandleFunc("GET /api/runs/{id}/stream", runsHandler.StreamRun)

	// Ferry: create migration run + kick off Band collaboration room
	mux.Handle("POST /api/ferry/runs", authMiddleware.Authenticate(http.HandlerFunc(ferryHandler.CreateRun)))

	handler := corsMiddleware(cfg)(mux)

	server := &http.Server{
		Addr:              ":" + cfg.Server.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("ferry backend listening on %s", server.Addr)
		if serveErr := server.ListenAndServe(); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			log.Fatalf("server failed: %v", serveErr)
		}
	}()

	waitForShutdown(server)
}

func connectDB(cfg *config.Config) (*pgxpool.Pool, error) {
	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.Name,
		cfg.Database.SSLMode,
	)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}
	return pool, nil
}

func connectRedis(cfg *config.Config) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr:       cfg.Redis.Host + ":" + cfg.Redis.Port,
		Password:   cfg.Redis.Password,
		DB:         cfg.Redis.DB,
		MaxRetries: cfg.Redis.MaxRetries,
	})
}

func corsMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	origins := make(map[string]bool)
	for _, o := range cfg.CORS.AllowedOrigins {
		origins[strings.TrimSpace(o)] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origins["*"] || origins[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
			w.Header().Set("Access-Control-Allow-Methods", strings.Join(cfg.CORS.AllowedMethods, ", "))
			w.Header().Set("Access-Control-Allow-Headers", strings.Join(cfg.CORS.AllowedHeaders, ", "))
			if cfg.CORS.AllowCredentials {
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"service": "ferry-backend", "status": "running"})
}

func handleHealth(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":    "ok",
			"service":   "ferry-backend",
			"env":       cfg.Server.Env,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, `{"error":"failed to encode response"}`, http.StatusInternalServerError)
	}
}

func waitForShutdown(server *http.Server) {
	signalContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-signalContext.Done()
	log.Println("shutdown signal received")

	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownContext); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
		if closeErr := server.Close(); closeErr != nil {
			log.Printf("forced shutdown failed: %v", closeErr)
		}
	}
}
