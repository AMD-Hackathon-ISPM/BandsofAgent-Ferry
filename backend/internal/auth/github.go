package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type GitHubOAuthConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	FrontendURL  string
}

type GitHubHandler struct {
	cfg     GitHubOAuthConfig
	service *Service
	states  sync.Map
	rdb     *redis.Client
}

func NewGitHubHandler(cfg GitHubOAuthConfig, service *Service, rdb *redis.Client) *GitHubHandler {
	return &GitHubHandler{cfg: cfg, service: service, rdb: rdb}
}

func (h *GitHubHandler) HandleBegin(w http.ResponseWriter, r *http.Request) {
	state, err := generateState()
	if err != nil {
		http.Error(w, "failed to generate state", http.StatusInternalServerError)
		return
	}
	h.states.Store(state, time.Now().Add(10*time.Minute))

	params := url.Values{
		"client_id":    {h.cfg.ClientID},
		"redirect_uri": {h.cfg.RedirectURI},
		"state":        {state},
	}

	http.Redirect(w, r, "https://github.com/login/oauth/authorize?"+params.Encode(), http.StatusTemporaryRedirect)
}

func (h *GitHubHandler) HandleCallback(w http.ResponseWriter, r *http.Request) {
	frontendCallback := h.cfg.FrontendURL + "/auth/callback"

	if errParam := r.URL.Query().Get("error"); errParam != "" {
		http.Redirect(w, r, frontendCallback+"?error=access_denied", http.StatusTemporaryRedirect)
		return
	}

	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")

	expiry, ok := h.states.LoadAndDelete(state)
	if !ok || time.Now().After(expiry.(time.Time)) {
		http.Redirect(w, r, frontendCallback+"?error=invalid_state", http.StatusTemporaryRedirect)
		return
	}

	ghToken, err := h.exchangeCode(r.Context(), code)
	if err != nil {
		http.Redirect(w, r, frontendCallback+"?error=exchange_failed", http.StatusTemporaryRedirect)
		return
	}

	ghUser, err := h.getGitHubUser(r.Context(), ghToken)
	if err != nil {
		http.Redirect(w, r, frontendCallback+"?error=user_fetch_failed", http.StatusTemporaryRedirect)
		return
	}

	result, err := h.service.GitHubLogin(r.Context(), ghUser)
	if err != nil {
		http.Redirect(w, r, frontendCallback+"?error=login_failed", http.StatusTemporaryRedirect)
		return
	}

	if h.rdb != nil {
		h.rdb.Set(r.Context(), "github_token:"+result.UserID, ghToken, 8*time.Hour)
	}

	params := url.Values{
		"access_token":  {result.Tokens.AccessToken},
		"refresh_token": {result.Tokens.RefreshToken},
		"user_id":       {result.UserID},
		"user_name":     {ghUser.Name},
		"user_email":    {ghUser.Email},
		"user_handle":   {ghUser.Login},
		"user_avatar":   {ghUser.AvatarURL},
		"role":          {result.Role},
	}

	http.Redirect(w, r, frontendCallback+"?"+params.Encode(), http.StatusTemporaryRedirect)
}

func (h *GitHubHandler) exchangeCode(ctx context.Context, code string) (string, error) {
	body := strings.NewReader(url.Values{
		"client_id":     {h.cfg.ClientID},
		"client_secret": {h.cfg.ClientSecret},
		"code":          {code},
		"redirect_uri":  {h.cfg.RedirectURI},
	}.Encode())

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://github.com/login/oauth/access_token", body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var result struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("failed to parse token response: %w", err)
	}
	if result.Error != "" {
		return "", fmt.Errorf("github token error: %s", result.Error)
	}
	return result.AccessToken, nil
}

func (h *GitHubHandler) getGitHubUser(ctx context.Context, token string) (*GitHubUserInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var user GitHubUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}

	// If the primary email is private, fetch from /user/emails
	if user.Email == "" {
		user.Email, _ = h.getGitHubPrimaryEmail(ctx, token)
	}

	if user.Email == "" {
		return nil, fmt.Errorf("could not retrieve GitHub email")
	}

	return &user, nil
}

func (h *GitHubHandler) getGitHubPrimaryEmail(ctx context.Context, token string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/emails", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", err
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	return "", fmt.Errorf("no verified primary email")
}

func generateState() (string, error) {
	b := make([]byte, 16)
	if _, err := generateRandomBytes(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}
