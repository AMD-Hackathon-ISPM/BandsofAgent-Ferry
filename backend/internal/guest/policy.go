package guest

import (
	"fmt"
	"regexp"
	"strings"
)

var repoPattern = regexp.MustCompile(`^[A-Za-z0-9.-]+/[A-Za-z0-9._-]+$`)

type RepoPolicy struct {
	repos []string
	set   map[string]struct{}
}

func NewRepoPolicy(repos []string) (*RepoPolicy, error) {
	policy := &RepoPolicy{set: make(map[string]struct{}, len(repos))}
	for _, repo := range repos {
		normalized, ok := NormalizeRepo(repo)
		if !ok {
			return nil, fmt.Errorf("invalid guest repository %q", repo)
		}
		if _, exists := policy.set[normalized]; exists {
			continue
		}
		policy.set[normalized] = struct{}{}
		policy.repos = append(policy.repos, normalized)
	}
	if len(policy.repos) == 0 {
		return nil, fmt.Errorf("at least one guest repository is required")
	}
	return policy, nil
}

func NormalizeRepo(repo string) (string, bool) {
	repo = strings.TrimSpace(repo)
	repo = strings.TrimPrefix(repo, "https://github.com/")
	repo = strings.TrimPrefix(repo, "http://github.com/")
	repo = strings.TrimSuffix(repo, "/")
	repo = strings.TrimSuffix(repo, ".git")
	if !repoPattern.MatchString(repo) {
		return "", false
	}
	return strings.ToLower(repo), true
}

func (p *RepoPolicy) Allowed(repo string) bool {
	if p == nil {
		return false
	}
	normalized, ok := NormalizeRepo(repo)
	if !ok {
		return false
	}
	_, ok = p.set[normalized]
	return ok
}

func (p *RepoPolicy) Repos() []string {
	if p == nil {
		return nil
	}
	return append([]string(nil), p.repos...)
}
