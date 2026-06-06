package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	MinIO    MinIOConfig
	JWT      JWTConfig
	Band     BandConfig
	Model    ModelConfig
	GitHub   GitHubConfig
	Logging  LoggingConfig
	CORS     CORSConfig
	Features FeatureFlags
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
	Provider string
	BaseURL  string
	APIKey   string
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
	ClientID     string
	ClientSecret string
	RedirectURI  string
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
			Provider: getEnv("BAND_PROVIDER", "stub"),
			BaseURL:  getEnv("BAND_BASE_URL", ""),
			APIKey:   getEnv("BAND_API_KEY", ""),
		},
		Model: ModelConfig{
			Provider:    getEnv("MODEL_PROVIDER", "featherless"),
			APIKey:      getEnv("MODEL_API_KEY", ""),
			Model:       getEnv("MODEL_NAME", "meta-llama/Meta-Llama-3.1-70B-Instruct"),
			Temperature: getEnvAsFloat("MODEL_TEMPERATURE", 0.7),
			MaxTokens:   getEnvAsInt("MODEL_MAX_TOKENS", 4096),
			Endpoint:    getEnv("MODEL_ENDPOINT", ""),
		},
		GitHub: GitHubConfig{
			PAT:          getEnv("GITHUB_PAT", ""),
			ClientID:     getEnv("GITHUB_CLIENT_ID", ""),
			ClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
			RedirectURI:  getEnv("GITHUB_REDIRECT_URI", "http://localhost:8080/auth/github/callback"),
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
	return nil
}

func (c *Config) IsDevelopment() bool {
	return c.Server.Env == "development"
}

func (c *Config) IsProduction() bool {
	return c.Server.Env == "production"
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
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
