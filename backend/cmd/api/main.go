package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ferry/backend/internal/config"
)

type healthResponse struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Env       string `json:"env"`
	Timestamp string `json:"timestamp"`
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", handleRoot)
	mux.HandleFunc("/health", handleHealth(cfg))

	server := &http.Server{
		Addr:              ":" + cfg.Server.Port,
		Handler:           mux,
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

func handleRoot(writer http.ResponseWriter, request *http.Request) {
	if request.URL.Path != "/" {
		http.NotFound(writer, request)
		return
	}

	writeJSON(writer, http.StatusOK, map[string]string{
		"service": "ferry-backend",
		"status":  "running",
	})
}

func handleHealth(cfg *config.Config) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		writeJSON(writer, http.StatusOK, healthResponse{
			Status:    "ok",
			Service:   "ferry-backend",
			Env:       cfg.Server.Env,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func writeJSON(writer http.ResponseWriter, statusCode int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(statusCode)

	if err := json.NewEncoder(writer).Encode(payload); err != nil {
		http.Error(writer, `{"error":"failed to encode response"}`, http.StatusInternalServerError)
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
