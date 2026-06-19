package worker

import (
	"context"
	"log"
	"strings"
	"sync"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/github"
)

type SourceProvider struct {
	tokens *github.UserTokens // resolves/re-mints the user's GitHub token (falls back to PAT)
	app    *github.App        // GitHub App, for minting per-repo installation tokens; nil if unconfigured
	mu     sync.Mutex
	cache  map[string]string
}

func NewSourceProvider(tokens *github.UserTokens, app *github.App) *SourceProvider {
	return &SourceProvider{tokens: tokens, app: app, cache: make(map[string]string)}
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

	gh := github.NewClient(s.tokens.Token(ctx, rc.User))
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

// Token resolves the GitHub token for read operations. The user's OAuth token
// keeps repository discovery aligned with what they can see in the UI.
func (s *SourceProvider) Token(ctx context.Context, userID string) string {
	return s.tokens.Token(ctx, userID)
}

// WriteTokens returns the candidate credentials for pushing to owner/repo, in
// priority order and de-duplicated: (1) a GitHub App installation token for the
// repo — the preferred, no-PAT path that works once the user has installed the
// App; (2) the run creator's login token; (3) the operator PAT. The caller
// tries each in turn, so a credential without write access falls through.
func (s *SourceProvider) WriteTokens(ctx context.Context, userID, owner, repo string) []string {
	var out []string
	seen := map[string]bool{}
	add := func(t string) {
		if t != "" && !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	if s.app != nil {
		if t, err := s.app.InstallationToken(ctx, owner, repo); err == nil {
			add(t)
		} else {
			log.Printf("github app installation token unavailable for %s/%s: %v", owner, repo, err)
		}
	}
	add(s.tokens.LoginToken(ctx, userID)) // user's GitHub token, re-minted if expired
	add(s.tokens.PAT())                   // operator fallback
	return out
}

func splitRepo(full string) (owner, name string, ok bool) {
	parts := strings.SplitN(strings.TrimPrefix(full, "https://github.com/"), "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], strings.TrimSuffix(parts[1], ".git"), true
}
