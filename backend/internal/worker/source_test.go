package worker

import (
	"testing"

	"github.com/ferry/backend/internal/band"
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
