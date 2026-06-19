package worker

import (
	"context"
	"log"
	"strings"
	"sync"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/github"
	"github.com/ferry/backend/internal/guest"
)

type SourceProvider struct {
	tokens *github.UserTokens // resolves/re-mints the user's GitHub token (falls back to PAT)
	app    *github.App        // GitHub App, for minting per-repo installation tokens; nil if unconfigured
	mu     sync.Mutex
	cache  map[string]string
	guestPAT    string
	guestPolicy *guest.RepoPolicy
}

func NewSourceProvider(tokens *github.UserTokens, app *github.App, guestPAT string, guestPolicy *guest.RepoPolicy) *SourceProvider {
	return &SourceProvider{tokens: tokens, app: app, cache: make(map[string]string), guestPAT: guestPAT, guestPolicy: guestPolicy}
}

func (s *SourceProvider) Digest(ctx context.Context, rc band.RunCtx) string {
	if rc.Repo == "" {
		return ""
	}
	owner, name, ok := splitRepo(rc.Repo)
	if !ok {
		return ""
	}
	key := digestCacheKey(rc)

	s.mu.Lock()
	if v, hit := s.cache[key]; hit {
		s.mu.Unlock()
		return v
	}
	s.mu.Unlock()

	token := s.Token(ctx, rc.User, rc.Repo, rc.IsGuest)
	if rc.IsGuest && token == "" {
		return ""
	}
	gh := github.NewClient(token)
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

func digestCacheKey(rc band.RunCtx) string {
	return rc.User + "@" + rc.Run + "@" + rc.Repo + "@" + rc.Branch + "@" + rc.Src
}

// Token resolves the GitHub token for read operations. The user's OAuth token
// keeps repository discovery aligned with what they can see in the UI.
func (s *SourceProvider) Token(ctx context.Context, userID, repo string, isGuest bool) string {
	if isGuest {
		if !s.guestPolicy.Allowed(repo) {
			return ""
		}
		return s.guestPAT
	}
	return s.tokens.Token(ctx, userID)
}

// WriteTokens returns the candidate credentials for pushing to owner/repo, in
// priority order and de-duplicated: (1) a GitHub App installation token for the
// repo — the preferred, no-PAT path that works once the user has installed the
// App; (2) the run creator's login token; (3) the operator PAT. The caller
// tries each in turn, so a credential without write access falls through.
func (s *SourceProvider) WriteTokens(ctx context.Context, userID, owner, repo string, isGuest bool) []string {
	var out []string
	seen := map[string]bool{}
	add := func(t string) {
		if t != "" && !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	if isGuest && (!s.guestPolicy.Allowed(owner+"/"+repo) || s.guestPAT == "") {
		return out
	}
	if s.app != nil {
		if t, err := s.app.InstallationToken(ctx, owner, repo); err == nil {
			add(t)
		} else {
			log.Printf("github app installation token unavailable for %s/%s: %v", owner, repo, err)
		}
	}
	if isGuest {
		add(s.guestPAT)
		return out
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
