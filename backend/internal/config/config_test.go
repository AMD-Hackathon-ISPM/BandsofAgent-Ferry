package config

import (
	"strings"
	"testing"
	"time"
)

func validConfig() *Config {
	return &Config{
		Database: DatabaseConfig{Password: "db"},
		JWT:      JWTConfig{Secret: "jwt"},
		MinIO:    MinIOConfig{SecretKey: "minio"},
		Guest: GuestConfig{
			SessionTTL: time.Hour, RateWindow: time.Hour, CreationLimitPerIP: 1,
			RunCreationLimitPerIP: 1, ActiveRunLimitPerSession: 1, GlobalRunLimit: 1,
		},
	}
}

func TestValidateGuestModeRequiresPAT(t *testing.T) {
	cfg := validConfig()
	cfg.Features.EnableGuestMode = true
	cfg.GitHub.GuestRepos = []string{"ferrymigrator/repo"}

	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "GITHUB_GUEST_PAT") {
		t.Fatalf("Validate() error = %v, want GITHUB_GUEST_PAT error", err)
	}
}

func TestValidateGuestModeRequiresValidRepos(t *testing.T) {
	cfg := validConfig()
	cfg.Features.EnableGuestMode = true
	cfg.GitHub.GuestPAT = "guest-pat"
	cfg.GitHub.GuestRepos = []string{"not-a-repo"}

	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "GUEST_REPOS") {
		t.Fatalf("Validate() error = %v, want GUEST_REPOS error", err)
	}
}

func TestValidateGuestModeAcceptsConfiguredCredentials(t *testing.T) {
	cfg := validConfig()
	cfg.Features.EnableGuestMode = true
	cfg.GitHub.GuestPAT = "guest-pat"
	cfg.GitHub.GuestRepos = []string{"ferrymigrator/repo-one", "ferrymigrator/repo-two"}

	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate() error = %v, want nil", err)
	}
}
