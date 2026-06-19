package github

import (
	"strings"
	"testing"
)

func TestNewAppRequiresPrivateKeyWhenAppIDConfigured(t *testing.T) {
	app, err := NewApp("3988134", "ferrythemigrator", "")
	if err == nil {
		t.Fatal("NewApp() error = nil, want missing private key error")
	}
	if app != nil {
		t.Fatalf("NewApp() app = %#v, want nil", app)
	}
	if !strings.Contains(err.Error(), "GITHUB_APP_ID is set") {
		t.Fatalf("NewApp() error = %q, want GITHUB_APP_ID context", err)
	}
}

func TestNewAppAllowsUnconfiguredApp(t *testing.T) {
	app, err := NewApp("", "ferrythemigrator", "")
	if err != nil {
		t.Fatalf("NewApp() error = %v, want nil", err)
	}
	if app != nil {
		t.Fatalf("NewApp() app = %#v, want nil", app)
	}
}
