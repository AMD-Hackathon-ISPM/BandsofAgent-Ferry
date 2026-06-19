package worker

import (
	"context"
	"reflect"
	"testing"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/github"
	"github.com/ferry/backend/internal/guest"
)

func TestDigestCacheKeyIncludesUser(t *testing.T) {
	base := band.RunCtx{
		Repo:   "octo/private",
		Branch: "main",
		Src:    "java",
		User:   "user-a",
		Run:    "run-a",
	}
	other := base
	other.User = "user-b"

	if digestCacheKey(base) == digestCacheKey(other) {
		t.Fatal("digest cache key should differ by user")
	}
}

func TestWriteTokensForGuestExcludesLoginAndOperatorTokens(t *testing.T) {
	policy, err := guest.NewRepoPolicy([]string{"ferrymigrator/repo"})
	if err != nil {
		t.Fatal(err)
	}
	tokens := github.NewUserTokens(nil, "", "", "operator-pat")
	source := NewSourceProvider(tokens, nil, "guest-pat", policy)

	got := source.WriteTokens(context.Background(), "guest-user", "ferrymigrator", "repo", true)
	want := []string{"guest-pat"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("WriteTokens() = %v, want %v", got, want)
	}
}

func TestWriteTokensForGuestFailsClosedWithoutGuestPAT(t *testing.T) {
	policy, err := guest.NewRepoPolicy([]string{"ferrymigrator/repo"})
	if err != nil {
		t.Fatal(err)
	}
	tokens := github.NewUserTokens(nil, "", "", "operator-pat")
	source := NewSourceProvider(tokens, nil, "", policy)

	if got := source.WriteTokens(context.Background(), "guest-user", "ferrymigrator", "repo", true); len(got) != 0 {
		t.Fatalf("WriteTokens() = %v, want no credentials", got)
	}
}

func TestDigestCacheKeyIncludesRun(t *testing.T) {
	base := band.RunCtx{
		Repo:   "octo/private",
		Branch: "main",
		Src:    "java",
		User:   "user-a",
		Run:    "run-a",
	}
	other := base
	other.Run = "run-b"

	if digestCacheKey(base) == digestCacheKey(other) {
		t.Fatal("digest cache key should differ by run")
	}
}

func TestTokenForGuestRejectsDisallowedRepo(t *testing.T) {
	policy, err := guest.NewRepoPolicy([]string{"ferrymigrator/repo"})
	if err != nil {
		t.Fatal(err)
	}
	source := NewSourceProvider(github.NewUserTokens(nil, "", "", "operator-pat"), nil, "guest-pat", policy)

	if got := source.Token(context.Background(), "guest-user", "someone/public", true); got != "" {
		t.Fatalf("Token() = %q, want empty token", got)
	}
}
