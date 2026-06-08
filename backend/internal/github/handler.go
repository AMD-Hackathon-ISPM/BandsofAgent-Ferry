package github

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/ferry/backend/internal/http/middleware"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	rdb         *redis.Client
	fallbackPAT string
}

func NewHandler(rdb *redis.Client, fallbackPAT string) *Handler {
	return &Handler{rdb: rdb, fallbackPAT: fallbackPAT}
}

func (h *Handler) clientForUser(ctx context.Context, userID string) *Client {
	token, err := h.rdb.Get(ctx, "github_token:"+userID).Result()
	if err != nil || token == "" {
		token = h.fallbackPAT
	}
	return NewClient(token)
}

func (h *Handler) ResolveRepo(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	repoParam := r.URL.Query().Get("repo")
	parts := strings.SplitN(repoParam, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		writeError(w, http.StatusBadRequest, "invalid repo format, expected owner/name")
		return
	}

	client := h.clientForUser(r.Context(), userID)
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
	client := h.clientForUser(r.Context(), userID)

	suggestions, err := client.ListUserRepos(r.Context())
	if err != nil || len(suggestions) == 0 {
		writeJSON(w, http.StatusOK, []RepoSuggestion{})
		return
	}

	writeJSON(w, http.StatusOK, suggestions)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
