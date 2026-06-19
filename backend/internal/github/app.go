package github

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrAppNotInstalled means the GitHub App isn't installed on the target repo, so
// no installation token can be minted (the user must install it first).
var ErrAppNotInstalled = errors.New("github app not installed on repository")

// App authenticates as a GitHub App to mint short-lived, per-repo installation
// access tokens for pushing — the standard SaaS pattern that needs no PAT and no
// per-user token. The only secret is the App's private key (operator-held).
type App struct {
	appID string
	slug  string
	key   *rsa.PrivateKey
}

// NewApp parses the App's PEM private key. Returns (nil, nil) when the App isn't
// configured (no id), so callers can treat App support as optional.
func NewApp(appID, slug, privateKeyPEM string) (*App, error) {
	if appID == "" {
		return nil, nil
	}
	if privateKeyPEM == "" {
		return nil, fmt.Errorf("GITHUB_APP_ID is set (%s) but no private key was loaded -- set GITHUB_APP_PRIVATE_KEY_PATH to a readable .pem (or GITHUB_APP_PRIVATE_KEY)", appID)
	}
	key, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(privateKeyPEM))
	if err != nil {
		return nil, fmt.Errorf("parse GitHub App private key: %w", err)
	}
	return &App{appID: appID, slug: slug, key: key}, nil
}

// InstallURL is where users are sent to install the App on their repositories.
func (a *App) InstallURL() string {
	if a.slug == "" {
		return ""
	}
	return "https://github.com/apps/" + a.slug + "/installations/new"
}

// jwt builds a short-lived App JWT (RS256) used to call the App-level endpoints.
func (a *App) appJWT() (string, error) {
	now := time.Now()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.RegisteredClaims{
		Issuer:    a.appID,
		IssuedAt:  jwt.NewNumericDate(now.Add(-30 * time.Second)), // tolerate clock skew
		ExpiresAt: jwt.NewNumericDate(now.Add(9 * time.Minute)),   // GitHub caps at 10m
	})
	return tok.SignedString(a.key)
}

// installationID resolves the App's installation id for a repo. Returns
// ErrAppNotInstalled on 404.
func (a *App) installationID(ctx context.Context, owner, repo string) (int64, error) {
	j, err := a.appJWT()
	if err != nil {
		return 0, err
	}
	body, status, err := NewClient(j).get(ctx, fmt.Sprintf("/repos/%s/%s/installation", owner, repo))
	if err != nil {
		return 0, fmt.Errorf("lookup installation: %w", err)
	}
	if status == http.StatusNotFound {
		return 0, ErrAppNotInstalled
	}
	if status < 200 || status >= 300 {
		return 0, fmt.Errorf("lookup installation: github status %d", status)
	}
	var inst struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(body, &inst); err != nil {
		return 0, fmt.Errorf("decode installation: %w", err)
	}
	return inst.ID, nil
}

// Installed reports whether the App is installed on the repo.
func (a *App) Installed(ctx context.Context, owner, repo string) (bool, error) {
	_, err := a.installationID(ctx, owner, repo)
	if errors.Is(err, ErrAppNotInstalled) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// InstallationToken mints a ~1h installation access token for the repo, scoped
// to the App's permissions. Returns ErrAppNotInstalled if the App isn't
// installed on the repo.
func (a *App) InstallationToken(ctx context.Context, owner, repo string) (string, error) {
	id, err := a.installationID(ctx, owner, repo)
	if err != nil {
		return "", err
	}
	j, err := a.appJWT()
	if err != nil {
		return "", err
	}
	var out struct {
		Token string `json:"token"`
	}
	if err := NewClient(j).send(ctx, http.MethodPost,
		"/app/installations/"+strconv.FormatInt(id, 10)+"/access_tokens", nil, &out); err != nil {
		return "", fmt.Errorf("create installation token: %w", err)
	}
	if out.Token == "" {
		return "", fmt.Errorf("create installation token: empty token")
	}
	return out.Token, nil
}
