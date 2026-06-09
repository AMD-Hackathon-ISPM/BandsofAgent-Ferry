package ferry

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/config"
	"github.com/ferry/backend/internal/db"
	"github.com/ferry/backend/internal/http/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	pool   *pgxpool.Pool
	q      *db.Queries
	band   *band.Service
	agents config.AgentsConfig
}

func NewHandler(pool *pgxpool.Pool, q *db.Queries, bandSvc *band.Service, agents config.AgentsConfig) *Handler {
	return &Handler{pool: pool, q: q, band: bandSvc, agents: agents}
}

type createFerryRunRequest struct {
	RepoFullName       string `json:"repoFullName"`
	Branch             string `json:"branch,omitempty"`
	SourceLanguage     string `json:"sourceLanguage"`
	TargetLanguage     string `json:"targetLanguage"`
	DBMigrationEnabled bool   `json:"dbMigrationEnabled"`
	DBFileID           string `json:"dbFileId,omitempty"`
}

type createFerryRunResponse struct {
	RunID      string `json:"runId"`
	BandChatID string `json:"bandChatId"`
	Status     string `json:"status"`
}

func (h *Handler) CreateRun(w http.ResponseWriter, r *http.Request) {
	companyID, err := uuid.Parse(middleware.GetCompanyID(r.Context()))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid company")
		return
	}
	userID, err := uuid.Parse(middleware.GetUserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid user")
		return
	}

	var req createFerryRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RepoFullName == "" || req.SourceLanguage == "" || req.TargetLanguage == "" {
		writeError(w, http.StatusBadRequest, "repoFullName, sourceLanguage and targetLanguage are required")
		return
	}

	ctx := r.Context()

	projectID, err := h.findOrCreateProject(ctx, companyID, userID, req)
	if err != nil {
		log.Printf("ferry: resolve project failed: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to resolve project")
		return
	}

	runNumber, err := h.q.GetNextRunNumber(ctx, companyID, projectID)
	if err != nil {
		log.Printf("ferry: next run number failed: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to allocate run number")
		return
	}
	pending := db.MigrationStatusPending
	run, err := h.q.CreateMigrationRun(ctx, companyID, projectID, runNumber, &pending, nil, nil, nil, userID)
	if err != nil {
		log.Printf("ferry: create run failed: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create migration run")
		return
	}

	rc := band.FerryRunContext{
		CompanyID:          companyID.String(),
		ProjectID:          projectID.String(),
		MigrationRunID:     run.ID.String(),
		RepoFullName:       req.RepoFullName,
		Branch:             req.Branch,
		SourceLanguage:     req.SourceLanguage,
		TargetLanguage:     req.TargetLanguage,
		DBMigrationEnabled: req.DBMigrationEnabled,
		DBFileID:           req.DBFileID,
		User:               userID.String(),
	}
	bandChatID, err := h.band.StartFerryBandRoom(ctx, rc)
	if err != nil {

		failed := db.MigrationStatusFailed
		msg := "failed to start Band room: " + err.Error()
		_, _ = h.q.UpdateMigrationRunStatus(ctx, companyID, run.ID, &failed, &msg)
		log.Printf("ferry: start band room failed: %v", err)
		writeError(w, http.StatusBadGateway, "failed to start Band collaboration room")
		return
	}

	if _, err := h.pool.Exec(ctx,
		`UPDATE migration_runs
		    SET band_room_id = $1, status = 'planning', started_at = NOW()
		  WHERE company_id = $2 AND id = $3`,
		bandChatID, companyID, run.ID,
	); err != nil {
		log.Printf("ferry: persist band room on run failed: %v", err)
	}

	metadata, _ := json.Marshal(map[string]interface{}{
		"repoFullName":       req.RepoFullName,
		"sourceLanguage":     req.SourceLanguage,
		"targetLanguage":     req.TargetLanguage,
		"dbMigrationEnabled": req.DBMigrationEnabled,
	})
	desc := "Ferry migration room for " + req.RepoFullName
	roomName := rc.RoomName()
	if _, err := h.q.CreateBandRoom(ctx, companyID, run.ID, bandChatID, roomName, &desc, metadata); err != nil {
		log.Printf("ferry: persist band_rooms record failed: %v", err)
	}

	writeJSON(w, http.StatusCreated, createFerryRunResponse{
		RunID:      run.ID.String(),
		BandChatID: bandChatID,
		Status:     "running",
	})
}

func (h *Handler) findOrCreateProject(ctx context.Context, companyID, userID uuid.UUID, req createFerryRunRequest) (uuid.UUID, error) {
	var projectID uuid.UUID
	err := h.pool.QueryRow(ctx,
		`SELECT id FROM projects WHERE company_id = $1 AND github_repo_url = $2 AND deleted_at IS NULL LIMIT 1`,
		companyID, req.RepoFullName,
	).Scan(&projectID)
	if err == nil {
		return projectID, nil
	}
	if err != pgx.ErrNoRows {
		return uuid.Nil, err
	}

	name := req.RepoFullName
	if parts := strings.SplitN(req.RepoFullName, "/", 2); len(parts) == 2 {
		name = parts[1]
	}

	srcLang := db.SourceLanguage(req.SourceLanguage)
	tgtLang := db.TargetLanguage(req.TargetLanguage)
	dbEnabled := req.DBMigrationEnabled
	repoURL := req.RepoFullName

	project, err := h.q.CreateProject(ctx, companyID, name, nil, srcLang, tgtLang, &dbEnabled, &repoURL, nil, []byte("{}"), userID)
	if err != nil {
		return uuid.Nil, err
	}
	return project.ID, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
