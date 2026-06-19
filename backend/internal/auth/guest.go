package auth

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/ferry/backend/internal/guest"
)

type GuestHandler struct {
	service   *Service
	admission *guest.Admission
}

func NewGuestHandler(service *Service, admission *guest.Admission) *GuestHandler {
	return &GuestHandler{service: service, admission: admission}
}

func (h *GuestHandler) Login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if err := h.admission.AllowGuestCreation(r.Context(), guest.ClientIP(r)); err != nil {
		status := http.StatusServiceUnavailable
		if errors.Is(err, guest.ErrRateLimited) {
			status = http.StatusTooManyRequests
		}
		http.Error(w, http.StatusText(status), status)
		return
	}
	result, err := h.service.GuestLogin(r.Context())
	if err != nil {
		http.Error(w, "guest login failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"accessToken":  result.Tokens.AccessToken,
		"refreshToken": result.Tokens.RefreshToken,
		"user":         result.User,
	})
}
