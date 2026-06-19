package github

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/ferry/backend/internal/guest"
	"github.com/ferry/backend/internal/http/middleware"
)

var ErrGuestCredentialsUnavailable = errors.New("guest GitHub credentials unavailable")

type Handler struct {
	tokens *UserTokens
	app    *App
	guestPAT    string
	guestPolicy *guest.RepoPolicy
}

func NewHandler(tokens *UserTokens, app *App, guestPAT string, guestPolicy *guest.RepoPolicy) *Handler {
	return &Handler{tokens: tokens, app: app, guestPAT: guestPAT, guestPolicy: guestPolicy}
}

func (h *Handler) clientForUser(ctx context.Context, userID string) (*Client, error) {
	if middleware.IsGuest(ctx) {
		if h.guestPAT == "" {
			return nil, ErrGuestCredentialsUnavailable
		}
		return NewClient(h.guestPAT), nil
	}
	return NewClient(h.tokens.Token(ctx, userID)), nil
}

func (h *Handler) ResolveRepo(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	repoParam := r.URL.Query().Get("repo")
	parts := strings.SplitN(repoParam, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		writeError(w, http.StatusBadRequest, "invalid repo format, expected owner/name")
		return
	}
	if middleware.IsGuest(r.Context()) && !h.guestPolicy.Allowed(repoParam) {
		writeError(w, http.StatusForbidden, "repository is not available to guests")
		return
	}

	client, err := h.clientForUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "guest GitHub access is unavailable")
		return
	}
	info, err := client.ResolveRepo(r.Context(), parts[0], parts[1])
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, http.StatusNotFound, "repository not found")
			return
		}
		writeError(w, http.StatusBadGateway, "failed to reach GitHub")
		return
	}

	writeJSON(w, http.StatusOK, info)
}

func (h *Handler) ListSuggestions(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	client, err := h.clientForUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "guest GitHub access is unavailable")
		return
	}
	if middleware.IsGuest(r.Context()) {
		suggestions := make([]RepoSuggestion, 0, len(h.guestPolicy.Repos()))
		for _, fullName := range h.guestPolicy.Repos() {
			parts := strings.SplitN(fullName, "/", 2)
			info, resolveErr := client.ResolveRepo(r.Context(), parts[0], parts[1])
			if resolveErr != nil {
				continue
			}
			suggestions = append(suggestions, RepoSuggestion{
				FullName: info.Owner + "/" + info.Name, DetectedLanguage: info.DetectedLanguage,
				DetectedLabel: info.DetectedLabel, Risk: info.Risk, Languages: info.Languages,
			})
		}
		writeJSON(w, http.StatusOK, suggestions)
		return
	}

	suggestions, err := client.ListUserRepos(r.Context())
	if err != nil || len(suggestions) == 0 {
		writeJSON(w, http.StatusOK, []RepoSuggestion{})
		return
	}

	writeJSON(w, http.StatusOK, suggestions)
}

// AppInstallation reports whether the Ferry GitHub App is installed on the
// given repo, and where to install it. The frontend uses this to gate launch:
// no install → no write access → show an install button. When the App isn't
// configured at all, report installed=true so the flow isn't blocked (the PR
// step still falls back to the login token / PAT).
func (h *Handler) AppInstallation(w http.ResponseWriter, r *http.Request) {
	repoParam := r.URL.Query().Get("repo")
	parts := strings.SplitN(repoParam, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		writeError(w, http.StatusBadRequest, "invalid repo format, expected owner/name")
		return
	}
	if middleware.IsGuest(r.Context()) && !h.guestPolicy.Allowed(repoParam) {
		writeError(w, http.StatusForbidden, "repository is not available to guests")
		return
	}

	if h.app == nil {
		writeJSON(w, http.StatusOK, map[string]any{"installed": true, "installUrl": ""})
		return
	}

	installed, err := h.app.Installed(r.Context(), parts[0], strings.TrimSuffix(parts[1], ".git"))
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to check GitHub App installation")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"installed":  installed,
		"installUrl": h.app.InstallURL(),
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
