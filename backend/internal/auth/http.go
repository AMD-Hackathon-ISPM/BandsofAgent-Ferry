package auth

import (
	"encoding/json"
	"errors"
	"net/http"
)

// HTTPHandler exposes token operations that aren't GitHub-specific.
type HTTPHandler struct {
	service *Service
}

func NewHTTPHandler(service *Service) *HTTPHandler {
	return &HTTPHandler{service: service}
}

type refreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

type tokenResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}

// HandleRefresh exchanges a valid refresh token for a fresh access+refresh pair.
// It is public (no access-token middleware) because it authenticates via the
// refresh token itself. The refresh token is rotated, so the client MUST store
// the returned refreshToken.
func (h *HTTPHandler) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		writeAuthError(w, http.StatusBadRequest, "refreshToken is required")
		return
	}

	tokens, err := h.service.RefreshToken(r.Context(), req.RefreshToken)
	if err != nil {
		if errors.Is(err, ErrRefreshTokenExpired) || errors.Is(err, ErrRefreshTokenInvalid) {
			writeAuthError(w, http.StatusUnauthorized, "refresh token expired or invalid")
			return
		}
		writeAuthError(w, http.StatusInternalServerError, "failed to refresh token")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(tokenResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
	})
}

func writeAuthError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
