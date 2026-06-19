package ferry

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ferry/backend/internal/config"
	"github.com/ferry/backend/internal/guest"
	"github.com/ferry/backend/internal/http/middleware"
	"github.com/google/uuid"
)

func TestCreateRunRejectsDisallowedGuestRepoBeforeDatabaseWork(t *testing.T) {
	policy, err := guest.NewRepoPolicy([]string{"ferrymigrator/allowed"})
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(nil, nil, nil, config.AgentsConfig{}, nil, policy, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/ferry/runs", bytes.NewBufferString(`{"repoFullName":"someone/private","sourceLanguage":"java","targetLanguage":"go"}`))
	ctx := context.WithValue(req.Context(), middleware.CompanyIDKey, uuid.NewString())
	ctx = context.WithValue(ctx, middleware.UserIDKey, uuid.NewString())
	ctx = context.WithValue(ctx, middleware.IsGuestKey, true)
	req = req.WithContext(ctx)
	rr := httptest.NewRecorder()

	handler.CreateRun(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
	}
}
