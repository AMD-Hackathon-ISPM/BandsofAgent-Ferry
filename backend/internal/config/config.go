package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ferry/backend/internal/guest"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	MinIO    MinIOConfig
	JWT      JWTConfig
	Band     BandConfig
	Model    ModelConfig
	Agents   AgentsConfig
	GitHub   GitHubConfig
	Logging  LoggingConfig
	CORS     CORSConfig
	Features FeatureFlags
	Sandbox  SandboxConfig
	Guest    GuestConfig
}

type SandboxConfig struct {
	RunnerURL string
}

type ServerConfig struct {
	Port        string
	Env         string
	FrontendURL string
}

type DatabaseConfig struct {
	Host            string
	Port            string
	Name            string
	User            string
	Password        string
	SSLMode         string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

type RedisConfig struct {
	Host       string
	Port       string
	Password   string
	DB         int
	MaxRetries int
	PoolSize   int
}

type MinIOConfig struct {
	Endpoint        string
	AccessKey       string
	SecretKey       string
	UseSSL          bool
	BucketSource    string
	BucketArtifacts string
	BucketReports   string
}

type JWTConfig struct {
	Secret        string
	AccessExpiry  time.Duration
	RefreshExpiry time.Duration
}

type BandConfig struct {
	Provider       string
	BaseURL        string
	APIKey         string
	AgentNamespace string

	Agents map[string]BandAgentIdentity
}

type BandAgentIdentity struct {
	Key    string
	ID     string
	APIKey string
}

func (b *BandConfig) Agent(key string) BandAgentIdentity {
	return b.Agents[key]
}

type ModelConfig struct {
	Provider    string
	APIKey      string
	Model       string
	Temperature float64
	MaxTokens   int
	Endpoint    string
}

type GitHubConfig struct {
	PAT          string
	GuestPAT     string
	GuestRepos   []string
	ClientID     string
	ClientSecret string
	RedirectURI  string
	// GitHub App identity, used to mint short-lived per-repo installation tokens
	// for pushing (no PATs). AppPrivateKey is the PEM contents.
	AppID         string
	AppSlug       string
	AppPrivateKey string
}

type LoggingConfig struct {
	Level  string
	Format string
}

type CORSConfig struct {
	AllowedOrigins   []string
	AllowedMethods   []string
	AllowedHeaders   []string
	AllowCredentials bool
}

type FeatureFlags struct {
	EnableDBMigration       bool
	EnableGitHubIntegration bool
	EnableRealBand          bool
	EnableCodeExecution     bool
	EnableGuestMode         bool
}

type GuestConfig struct {
	SessionTTL               time.Duration
	RateWindow               time.Duration
	CreationLimitPerIP       int
	RunCreationLimitPerIP    int
	ActiveRunLimitPerSession int
	GlobalRunLimit           int
}

type APISourceConfig struct {
	BaseURL string
	// APIKeys is the pool of keys for this provider (one per concurrent run
	// slot). A run pinned to slot i uses APIKeys[i], isolating each concurrent
	// run's provider rate budget.
	APIKeys []string
}

// keyForSlot returns the key for a run slot, wrapping if there are fewer keys
// than slots (and "" if none configured).
func (s APISourceConfig) keyForSlot(slot int) string {
	if len(s.APIKeys) == 0 {
		return ""
	}
	if slot < 0 {
		slot = 0
	}
	return s.APIKeys[slot%len(s.APIKeys)]
}

type AgentModelConfig struct {
	Model  string
	Source string
}

type AgentsConfig struct {
	Sources map[string]APISourceConfig

	MaxConcurrency int

	Router            AgentModelConfig
	SourceAnalyzer    AgentModelConfig
	BusinessLogic     AgentModelConfig
	CodeGenerator     AgentModelConfig
	CodeGeneratorGo   AgentModelConfig
	CodeGeneratorRust AgentModelConfig
	DbMigration       AgentModelConfig
	TestGenerator     AgentModelConfig
	Reviewer          AgentModelConfig
	Commander         AgentModelConfig
	GithubConnector   AgentModelConfig
}

func (ac *AgentsConfig) agentByKey(agentKey string) AgentModelConfig {
	switch agentKey {
	case "router":
		return ac.Router
	case "source_analyzer":
		return ac.SourceAnalyzer
	case "business_logic":
		return ac.BusinessLogic
	case "code_generator":
		return ac.CodeGenerator
	case "db_migration":
		return ac.DbMigration
	case "test_generator":
		return ac.TestGenerator
	case "reviewer":
		return ac.Reviewer
	case "commander":
		return ac.Commander
	case "github_connector":
		return ac.GithubConnector
	default:
		return ac.Router
	}
}

func (ac *AgentsConfig) ForAgent(agentKey string) (baseURL, apiKey, model string) {
	return ac.ForAgentTargetSlot(agentKey, "", 0)
}

func (ac *AgentsConfig) ForAgentTarget(agentKey, target string) (baseURL, apiKey, model string) {
	return ac.ForAgentTargetSlot(agentKey, target, 0)
}

// ForAgentTargetSlot resolves the (base URL, API key, model) for an agent given
// the migration target language (code_generator uses a Go/Rust-specific model)
// and the run's concurrency slot (which selects the key from the provider pool).
func (ac *AgentsConfig) ForAgentTargetSlot(agentKey, target string, slot int) (baseURL, apiKey, model string) {
	cfg := ac.agentByKey(agentKey)
	if agentKey == "code_generator" {
		switch strings.ToLower(target) {
		case "go":
			if ac.CodeGeneratorGo.Model != "" {
				cfg = ac.CodeGeneratorGo
			}
		case "rust":
			if ac.CodeGeneratorRust.Model != "" {
				cfg = ac.CodeGeneratorRust
			}
		}
	}
	src, ok := ac.Sources[cfg.Source]
	if !ok {
		src = ac.Sources["aimlapi"]
	}
	return src.BaseURL, src.keyForSlot(slot), cfg.Model
}

// Slots is the number of concurrent run slots = the size of the smallest
// configured provider key pool (so every slot has a key in each provider). At
// least 1.
func (ac *AgentsConfig) Slots() int {
	n := -1
	for _, name := range []string{"aimlapi", "featherless"} {
		k := len(ac.Sources[name].APIKeys)
		if k == 0 {
			continue
		}
		if n == -1 || k < n {
			n = k
		}
	}
	if n < 1 {
		return 1
	}
	return n
}

func (ac *AgentsConfig) ModelFor(agentKey string) (model, source string) {
	cfg := ac.agentByKey(agentKey)
	return cfg.Model, cfg.Source
}

func Load() (*Config, error) {
	cfg := &Config{
		Server: ServerConfig{
			Port:        getEnv("PORT", "8080"),
			Env:         getEnv("ENV", "development"),
			FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),
		},
		Database: DatabaseConfig{
			Host:            getEnv("DB_HOST", "localhost"),
			Port:            getEnv("DB_PORT", "5432"),
			Name:            getEnv("DB_NAME", "ferry"),
			User:            getEnv("DB_USER", "ferry"),
			Password:        getEnv("DB_PASSWORD", ""),
			SSLMode:         getEnv("DB_SSL_MODE", "disable"),
			MaxOpenConns:    getEnvAsInt("DB_MAX_OPEN_CONNS", 25),
			MaxIdleConns:    getEnvAsInt("DB_MAX_IDLE_CONNS", 5),
			ConnMaxLifetime: getEnvAsDuration("DB_CONN_MAX_LIFETIME", 5*time.Minute),
		},
		Redis: RedisConfig{
			Host:       getEnv("REDIS_HOST", "localhost"),
			Port:       getEnv("REDIS_PORT", "6379"),
			Password:   getEnv("REDIS_PASSWORD", ""),
			DB:         getEnvAsInt("REDIS_DB", 0),
			MaxRetries: getEnvAsInt("REDIS_MAX_RETRIES", 3),
			PoolSize:   getEnvAsInt("REDIS_POOL_SIZE", 10),
		},
		MinIO: MinIOConfig{
			Endpoint:        getEnv("MINIO_ENDPOINT", "localhost:9000"),
			AccessKey:       getEnv("MINIO_ACCESS_KEY", "ferry"),
			SecretKey:       getEnv("MINIO_SECRET_KEY", ""),
			UseSSL:          getEnvAsBool("MINIO_USE_SSL", false),
			BucketSource:    getEnv("MINIO_BUCKET_SOURCE", "ferry-source-files"),
			BucketArtifacts: getEnv("MINIO_BUCKET_ARTIFACTS", "ferry-artifacts"),
			BucketReports:   getEnv("MINIO_BUCKET_REPORTS", "ferry-reports"),
		},
		JWT: JWTConfig{
			Secret:        getEnv("JWT_SECRET", ""),
			AccessExpiry:  getEnvAsDuration("JWT_ACCESS_EXPIRY", 15*time.Minute),
			RefreshExpiry: getEnvAsDuration("JWT_REFRESH_EXPIRY", 168*time.Hour),
		},
		Band: BandConfig{
			Provider:       getEnv("BAND_PROVIDER", "stub"),
			BaseURL:        getEnv("BAND_BASE_URL", "https://app.band.ai/api/v1"),
			APIKey:         getEnv("BAND_API_KEY", ""),
			AgentNamespace: getEnv("BAND_AGENT_NAMESPACE", "dxs16823"),
			Agents:         loadBandAgents(),
		},
		Model: ModelConfig{
			Provider:    getEnv("MODEL_PROVIDER", "featherless"),
			APIKey:      getEnv("MODEL_API_KEY", ""),
			Model:       getEnv("MODEL_NAME", "meta-llama/Meta-Llama-3.1-70B-Instruct"),
			Temperature: getEnvAsFloat("MODEL_TEMPERATURE", 0.7),
			MaxTokens:   getEnvAsInt("MODEL_MAX_TOKENS", 16384),
			Endpoint:    getEnv("MODEL_ENDPOINT", ""),
		},
		GitHub: GitHubConfig{
			PAT:           getEnv("GITHUB_PAT", ""),
			GuestPAT:      getEnv("GITHUB_GUEST_PAT", ""),
			GuestRepos:    getEnvAsSlice("GUEST_REPOS", nil),
			ClientID:      getEnv("GITHUB_CLIENT_ID", ""),
			ClientSecret:  getEnv("GITHUB_CLIENT_SECRET", ""),
			RedirectURI:   getEnv("GITHUB_REDIRECT_URI", "http://localhost:8080/auth/github/callback"),
			AppID:         getEnv("GITHUB_APP_ID", ""),
			AppSlug:       getEnv("GITHUB_APP_SLUG", ""),
			AppPrivateKey: githubAppPrivateKey(),
		},
		Logging: LoggingConfig{
			Level:  getEnv("LOG_LEVEL", "info"),
			Format: getEnv("LOG_FORMAT", "json"),
		},
		CORS: CORSConfig{
			AllowedOrigins:   getEnvAsSlice("CORS_ALLOWED_ORIGINS", []string{"*"}),
			AllowedMethods:   getEnvAsSlice("CORS_ALLOWED_METHODS", []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}),
			AllowedHeaders:   getEnvAsSlice("CORS_ALLOWED_HEADERS", []string{"Content-Type", "Authorization"}),
			AllowCredentials: getEnvAsBool("CORS_ALLOW_CREDENTIALS", true),
		},
		Features: FeatureFlags{
			EnableDBMigration:       getEnvAsBool("ENABLE_DB_MIGRATION", true),
			EnableGitHubIntegration: getEnvAsBool("ENABLE_GITHUB_INTEGRATION", true),
			EnableRealBand:          getEnvAsBool("ENABLE_REAL_BAND", false),
			EnableCodeExecution:     getEnvAsBool("ENABLE_CODE_EXECUTION", false),
			EnableGuestMode:         getEnvAsBool("ENABLE_GUEST_MODE", false),
		},
		Guest: GuestConfig{
			SessionTTL:               getEnvAsDuration("GUEST_SESSION_TTL", 24*time.Hour),
			RateWindow:               getEnvAsDuration("GUEST_RATE_WINDOW", time.Hour),
			CreationLimitPerIP:       getEnvAsInt("GUEST_CREATION_LIMIT_PER_IP", 10),
			RunCreationLimitPerIP:    getEnvAsInt("GUEST_RUN_CREATION_LIMIT_PER_IP", 5),
			ActiveRunLimitPerSession: getEnvAsInt("GUEST_ACTIVE_RUN_LIMIT", 1),
			GlobalRunLimit:           getEnvAsInt("GUEST_GLOBAL_RUN_LIMIT", 6),
		},
		Sandbox: SandboxConfig{
			RunnerURL: getEnv("RUNNER_URL", ""),
		},
		Agents: AgentsConfig{
			MaxConcurrency: getEnvAsInt("LLM_MAX_CONCURRENCY", 2),
			Sources: map[string]APISourceConfig{
				"aimlapi": {
					BaseURL: getEnv("AIMLAPI_BASE_URL", "https://api.aimlapi.com/v1"),
					APIKeys: splitKeys(getEnv("AIMLAPI_KEY", "")),
				},
				"featherless": {
					BaseURL: getEnv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1"),
					APIKeys: splitKeys(getEnv("FEATHERLESS_KEY", "")),
				},
			},

			Router: AgentModelConfig{
				Model:  getEnv("AGENT_ROUTER_MODEL", "deepseek/deepseek-chat-v3.1"),
				Source: getEnv("AGENT_ROUTER_SOURCE", "aimlapi"),
			},
			Commander: AgentModelConfig{
				Model:  getEnv("AGENT_COMMANDER_MODEL", "deepseek/deepseek-chat-v3.1"),
				Source: getEnv("AGENT_COMMANDER_SOURCE", "aimlapi"),
			},
			TestGenerator: AgentModelConfig{
				Model:  getEnv("AGENT_TEST_GENERATOR_MODEL", "deepseek/deepseek-chat-v3.1"),
				Source: getEnv("AGENT_TEST_GENERATOR_SOURCE", "aimlapi"),
			},
			GithubConnector: AgentModelConfig{
				Model:  getEnv("AGENT_GITHUB_CONNECTOR_MODEL", "deepseek/deepseek-chat-v3.1"),
				Source: getEnv("AGENT_GITHUB_CONNECTOR_SOURCE", "aimlapi"),
			},

			SourceAnalyzer: AgentModelConfig{
				Model:  getEnv("AGENT_SOURCE_ANALYZER_MODEL", "Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled"),
				Source: getEnv("AGENT_SOURCE_ANALYZER_SOURCE", "featherless"),
			},
			BusinessLogic: AgentModelConfig{
				Model:  getEnv("AGENT_BUSINESS_LOGIC_MODEL", "Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled"),
				Source: getEnv("AGENT_BUSINESS_LOGIC_SOURCE", "featherless"),
			},
			CodeGenerator: AgentModelConfig{
				Model:  getEnv("AGENT_CODE_GENERATOR_MODEL", "Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled"),
				Source: getEnv("AGENT_CODE_GENERATOR_SOURCE", "featherless"),
			},
			CodeGeneratorGo: AgentModelConfig{
				Model:  getEnv("AGENT_CODE_GENERATOR_GO_MODEL", getEnv("AGENT_CODE_GENERATOR_MODEL", "Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled")),
				Source: getEnv("AGENT_CODE_GENERATOR_GO_SOURCE", getEnv("AGENT_CODE_GENERATOR_SOURCE", "featherless")),
			},
			CodeGeneratorRust: AgentModelConfig{
				Model:  getEnv("AGENT_CODE_GENERATOR_RUST_MODEL", getEnv("AGENT_CODE_GENERATOR_MODEL", "Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled")),
				Source: getEnv("AGENT_CODE_GENERATOR_RUST_SOURCE", getEnv("AGENT_CODE_GENERATOR_SOURCE", "featherless")),
			},
			DbMigration: AgentModelConfig{
				Model:  getEnv("AGENT_DB_MIGRATION_MODEL", "Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled"),
				Source: getEnv("AGENT_DB_MIGRATION_SOURCE", "featherless"),
			},
			Reviewer: AgentModelConfig{
				Model:  getEnv("AGENT_REVIEWER_MODEL", "Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled"),
				Source: getEnv("AGENT_REVIEWER_SOURCE", "featherless"),
			},
		},
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) Validate() error {
	if c.Database.Password == "" {
		return fmt.Errorf("DB_PASSWORD is required")
	}
	if c.JWT.Secret == "" {
		return fmt.Errorf("JWT_SECRET is required")
	}
	if c.MinIO.SecretKey == "" {
		return fmt.Errorf("MINIO_SECRET_KEY is required")
	}
	if c.Features.EnableGuestMode {
		if strings.TrimSpace(c.GitHub.GuestPAT) == "" {
			return fmt.Errorf("GITHUB_GUEST_PAT is required when ENABLE_GUEST_MODE=true")
		}
		if _, err := guest.NewRepoPolicy(c.GitHub.GuestRepos); err != nil {
			return fmt.Errorf("GUEST_REPOS is invalid: %w", err)
		}
		if c.Guest.SessionTTL <= 0 || c.Guest.RateWindow <= 0 || c.Guest.CreationLimitPerIP <= 0 || c.Guest.RunCreationLimitPerIP <= 0 || c.Guest.ActiveRunLimitPerSession <= 0 || c.Guest.GlobalRunLimit <= 0 {
			return fmt.Errorf("guest limits must be positive")
		}
	}
	return nil
}

func (c *Config) IsDevelopment() bool {
	return c.Server.Env == "development"
}

func (c *Config) IsProduction() bool {
	return c.Server.Env == "production"
}

var bandAgentKeys = []string{
	"router", "commander", "test_generator", "github_connector",
	"source_analyzer", "business_logic", "code_generator", "db_migration", "reviewer",
}

func loadBandAgents() map[string]BandAgentIdentity {
	agents := make(map[string]BandAgentIdentity, len(bandAgentKeys))
	for _, key := range bandAgentKeys {
		envPrefix := "BAND_" + strings.ToUpper(key)
		agents[key] = BandAgentIdentity{
			Key:    key,
			ID:     getEnv(envPrefix+"_ID", ""),
			APIKey: getEnv(envPrefix+"_KEY", ""),
		}
	}
	return agents
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// splitKeys parses a comma-separated key list (e.g. "k1,k2,k3") into a trimmed,
// non-empty slice — one key per concurrent run slot.
func splitKeys(raw string) []string {
	var out []string
	for _, k := range strings.Split(raw, ",") {
		if k = strings.TrimSpace(k); k != "" {
			out = append(out, k)
		}
	}
	return out
}

// githubAppPrivateKey resolves the GitHub App PEM from either a file path
// (GITHUB_APP_PRIVATE_KEY_PATH — easiest, no escaping) or an inline value
// (GITHUB_APP_PRIVATE_KEY, where literal "\n" escapes are expanded so the PEM
// fits on one .env line). The file path takes precedence when readable.
func githubAppPrivateKey() string {
	if path := os.Getenv("GITHUB_APP_PRIVATE_KEY_PATH"); path != "" {
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			log.Printf("config: GITHUB_APP_PRIVATE_KEY_PATH=%q is a directory, not a .pem file; if this is a Docker bind mount, the host source file is missing and Docker created an empty directory -- place the .pem at the host path and recreate the container", path)
			return strings.ReplaceAll(os.Getenv("GITHUB_APP_PRIVATE_KEY"), `\n`, "\n")
		}
		if b, err := os.ReadFile(path); err == nil && len(b) > 0 {
			return string(b)
		} else if err != nil {
			log.Printf("config: GITHUB_APP_PRIVATE_KEY_PATH=%q could not be read (%v); falling back to GITHUB_APP_PRIVATE_KEY", path, err)
		} else {
			log.Printf("config: GITHUB_APP_PRIVATE_KEY_PATH=%q was empty; falling back to GITHUB_APP_PRIVATE_KEY", path)
		}
	}
	return strings.ReplaceAll(os.Getenv("GITHUB_APP_PRIVATE_KEY"), `\n`, "\n")
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := os.Getenv(key)
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return defaultValue
}

func getEnvAsBool(key string, defaultValue bool) bool {
	valueStr := os.Getenv(key)
	if value, err := strconv.ParseBool(valueStr); err == nil {
		return value
	}
	return defaultValue
}

func getEnvAsFloat(key string, defaultValue float64) float64 {
	valueStr := os.Getenv(key)
	if value, err := strconv.ParseFloat(valueStr, 64); err == nil {
		return value
	}
	return defaultValue
}

func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	valueStr := os.Getenv(key)
	if value, err := time.ParseDuration(valueStr); err == nil {
		return value
	}
	return defaultValue
}

func getEnvAsSlice(key string, defaultValue []string) []string {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	var result []string
	for _, v := range splitString(valueStr, ",") {
		result = append(result, v)
	}
	return result
}

func splitString(s, sep string) []string {
	var result []string
	current := ""
	for _, char := range s {
		if string(char) == sep {
			if current != "" {
				result = append(result, current)
				current = ""
			}
		} else {
			current += string(char)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}
