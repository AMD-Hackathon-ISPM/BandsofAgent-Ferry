package auth

import (
	"testing"
	"time"
)

func TestGenerateTokenPairPreservesGuestClaim(t *testing.T) {
	manager := NewJWTManager("access", "refresh", time.Minute, time.Hour, "ferry")
	pair, err := manager.GenerateTokenPair("user", "company", "guest@example.com", "owner", true)
	if err != nil {
		t.Fatalf("GenerateTokenPair() error = %v", err)
	}

	claims, err := manager.ValidateAccessToken(pair.AccessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken() error = %v", err)
	}
	if !claims.IsGuest {
		t.Fatal("claims.IsGuest = false, want true")
	}
}
