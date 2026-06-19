package runs

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ferry/backend/internal/http/middleware"
	"github.com/google/uuid"
)

func TestGetArtifactContentReturnsNotFoundWhenStorageUnavailable(t *testing.T) {
	companyID := uuid.New()
	runID := uuid.New()
	artifactID := uuid.New()
	handler := NewHandler(nil, nil, nil, nil, nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/runs/"+runID.String()+"/artifacts/"+artifactID.String(), nil)
	req.SetPathValue("id", runID.String())
	req.SetPathValue("artifactId", artifactID.String())
	req = req.WithContext(context.WithValue(req.Context(), middleware.CompanyIDKey, companyID.String()))
	rr := httptest.NewRecorder()

	handler.GetArtifactContent(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
	}
}
