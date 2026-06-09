package worker

import (
	"context"
	"log"
	"strings"
	"sync"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/github"
	"github.com/redis/go-redis/v9"
)

type SourceProvider struct {
	pat   string
	rdb   *redis.Client
	mu    sync.Mutex
	cache map[string]string
}

func NewSourceProvider(pat string, rdb *redis.Client) *SourceProvider {
	return &SourceProvider{pat: pat, rdb: rdb, cache: make(map[string]string)}
}

func (s *SourceProvider) Digest(ctx context.Context, rc band.RunCtx) string {
	if rc.Repo == "" {
		return ""
	}
	owner, name, ok := splitRepo(rc.Repo)
	if !ok {
		return ""
	}
	key := rc.Repo + "@" + rc.Branch + "@" + rc.Src

	s.mu.Lock()
	if v, hit := s.cache[key]; hit {
		s.mu.Unlock()
		return v
	}
	s.mu.Unlock()

	gh := github.NewClient(s.resolveToken(ctx, rc.User))
	digest, err := gh.FetchSourceDigest(ctx, owner, name, rc.Branch, rc.Src)
	if err != nil {
		log.Printf("source fetch failed for %s: %v", rc.Repo, err)
		return ""
	}

	s.mu.Lock()
	s.cache[key] = digest
	s.mu.Unlock()
	return digest
}

func (s *SourceProvider) resolveToken(ctx context.Context, userID string) string {
	if s.rdb != nil && userID != "" {
		if t, err := s.rdb.Get(ctx, "github_token:"+userID).Result(); err == nil && t != "" {
			return t
		}
	}
	return s.pat
}

func splitRepo(full string) (owner, name string, ok bool) {
	parts := strings.SplitN(strings.TrimPrefix(full, "https://github.com/"), "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], strings.TrimSuffix(parts[1], ".git"), true
}
