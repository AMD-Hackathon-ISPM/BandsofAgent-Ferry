package github

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ferry/backend/internal/guest"
	"github.com/ferry/backend/internal/http/middleware"
)

func TestGuestRepoHandlersRejectDisallowedRepo(t *testing.T) {
	policy, err := guest.NewRepoPolicy([]string{"ferrymigrator/allowed"})
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(nil, nil, "guest-pat", policy)

	tests := []struct {
		name string
		call func(http.ResponseWriter, *http.Request)
		path string
	}{
		{name: "resolve", call: handler.ResolveRepo, path: "/api/github/repos/resolve?repo=someone/private"},
		{name: "installation", call: handler.AppInstallation, path: "/api/github/app/installation?repo=someone/private"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			req = req.WithContext(context.WithValue(req.Context(), middleware.IsGuestKey, true))
			rr := httptest.NewRecorder()

			tt.call(rr, req)

			if rr.Code != http.StatusForbidden {
				t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
			}
		})
	}
}
