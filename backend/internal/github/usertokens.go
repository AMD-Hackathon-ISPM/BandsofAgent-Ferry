package github

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Redis keys for a user's GitHub credentials. These strings are mirrored in
// internal/auth/github.go (which stores them on login) — keep them in sync.
const (
	tokenKey   = "github_token:"
	refreshKey = "github_refresh_token:"
)

const (
	// Cache TTL for a non-expiring user token (App without token expiration).
	defaultTokenTTL = 30 * 24 * time.Hour
	// GitHub user refresh tokens last ~6 months.
	refreshTokenTTL = 150 * 24 * time.Hour
)

// UserTokens resolves a usable GitHub token for a user, transparently
// re-minting an expired access token from the stored refresh token (GitHub Apps
// with user-token expiration enabled). Falls back to the operator PAT.
type UserTokens struct {
	rdb          *redis.Client
	clientID     string
	clientSecret string
	pat          string
}

func NewUserTokens(rdb *redis.Client, clientID, clientSecret, pat string) *UserTokens {
	return &UserTokens{rdb: rdb, clientID: clientID, clientSecret: clientSecret, pat: pat}
}

func (u *UserTokens) PAT() string { return u.pat }

// Store persists a freshly-obtained GitHub token pair. expiresIn is the access
// token lifetime in seconds (0 = non-expiring).
func (u *UserTokens) Store(ctx context.Context, userID, accessToken, refreshToken string, expiresIn int) {
	if u.rdb == nil || userID == "" || accessToken == "" {
		return
	}
	ttl := defaultTokenTTL
	if expiresIn > 0 {
		ttl = time.Duration(expiresIn) * time.Second
	}
	u.rdb.Set(ctx, tokenKey+userID, accessToken, ttl)
	if refreshToken != "" {
		u.rdb.Set(ctx, refreshKey+userID, refreshToken, refreshTokenTTL)
	}
}

// LoginToken returns the user's GitHub token (re-minting if the access token
// expired), or "" if none is available. It does NOT fall back to the PAT.
func (u *UserTokens) LoginToken(ctx context.Context, userID string) string {
	if u.rdb == nil || userID == "" {
		return ""
	}
	if t, err := u.rdb.Get(ctx, tokenKey+userID).Result(); err == nil && t != "" {
		return t
	}
	if rt, err := u.rdb.Get(ctx, refreshKey+userID).Result(); err == nil && rt != "" {
		return u.remint(ctx, userID, rt)
	}
	return ""
}

// Token returns a usable GitHub token: the user's (re-minted if needed), else
// the operator PAT.
func (u *UserTokens) Token(ctx context.Context, userID string) string {
	if t := u.LoginToken(ctx, userID); t != "" {
		return t
	}
	return u.pat
}

// remint exchanges a refresh token for a new access token and persists both.
func (u *UserTokens) remint(ctx context.Context, userID, refreshToken string) string {
	if u.clientID == "" || u.clientSecret == "" {
		return ""
	}
	form := url.Values{
		"client_id":     {u.clientID},
		"client_secret": {u.clientSecret},
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return ""
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	var out struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		Error        string `json:"error"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || out.AccessToken == "" {
		return ""
	}
	u.Store(ctx, userID, out.AccessToken, out.RefreshToken, out.ExpiresIn)
	return out.AccessToken
}
