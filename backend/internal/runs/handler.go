package runs

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ferry/backend/internal/auth"
	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/db"
	"github.com/ferry/backend/internal/http/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	pool        *pgxpool.Pool
	q           *db.Queries
	rdb         *redis.Client
	authService *auth.Service
	band        *band.Service
}

func NewHandler(pool *pgxpool.Pool, q *db.Queries, rdb *redis.Client, authService *auth.Service, bandSvc *band.Service) *Handler {
	return &Handler{pool: pool, q: q, rdb: rdb, authService: authService, band: bandSvc}
}

// --- View models (match frontend types.ts) ---

type projectVM struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	RepoURL        string `json:"repoUrl"`
	RepoOwner      string `json:"repoOwner"`
	RepoName       string `json:"repoName"`
	SourceLanguage string `json:"sourceLanguage"`
	TargetLanguage string `json:"targetLanguage"`
	DbEnabled      bool   `json:"dbEnabled"`
}

type agentRuntimeVM struct {
	Key          string  `json:"key"`
	Status       string  `json:"status"`
	CurrentTask  *string `json:"currentTask,omitempty"`
	LastActionAt *string `json:"lastActionAt,omitempty"`
}

type AgentMessageVM struct {
	ID             string                 `json:"id"`
	Agent          string                 `json:"agent"`
	Type           string                 `json:"type"`
	Phase          string                 `json:"phase"`
	Summary        string                 `json:"summary"`
	Payload        map[string]interface{} `json:"payload,omitempty"`
	RequiresAction bool                   `json:"requiresAction,omitempty"`
	TargetAgent    *string                `json:"targetAgent,omitempty"`
	CreatedAt      string                 `json:"createdAt"`
}

type artifactVM struct {
	ID        string  `json:"id"`
	Type      string  `json:"type"`
	FileName  string  `json:"fileName"`
	SizeBytes int64   `json:"sizeBytes"`
	CreatedBy string  `json:"createdBy"`
	Preview   *string `json:"preview,omitempty"`
}

type dbPlanVM struct {
	ID                  string   `json:"id"`
	RiskLevel           string   `json:"riskLevel"`
	RequiresDowntime    bool     `json:"requiresDowntime"`
	EstimatedSeconds    int      `json:"estimatedSeconds"`
	RiskFactors         []string `json:"riskFactors"`
	ApprovedBy          *string  `json:"approvedBy,omitempty"`
	ApprovedAt          *string  `json:"approvedAt,omitempty"`
	MigrationSqlPreview string   `json:"migrationSqlPreview"`
}

type prVM struct {
	Number       int32  `json:"number"`
	URL          string `json:"url"`
	Title        string `json:"title"`
	Status       string `json:"status"`
	SourceBranch string `json:"sourceBranch"`
	TargetBranch string `json:"targetBranch"`
}

type runVM struct {
	ID           string           `json:"id"`
	RunNumber    int32            `json:"runNumber"`
	Project      projectVM        `json:"project"`
	Status       string           `json:"status"`
	CurrentPhase *string          `json:"currentPhase"`
	BandRoomName string           `json:"bandRoomName"`
	SourceCommit string           `json:"sourceCommit"`
	TargetBranch string           `json:"targetBranch"`
	StartedAt    *string          `json:"startedAt,omitempty"`
	CompletedAt  *string          `json:"completedAt,omitempty"`
	ErrorMessage *string          `json:"errorMessage,omitempty"`
	Agents       []agentRuntimeVM `json:"agents"`
	Messages     []AgentMessageVM `json:"messages"`
	Artifacts    []artifactVM     `json:"artifacts"`
	DbPlan       *dbPlanVM        `json:"dbPlan"`
	PR           *prVM            `json:"pr"`
}

type recentRunVM struct {
	ID             string `json:"id"`
	RunNumber      int32  `json:"runNumber"`
	ProjectName    string `json:"projectName"`
	SourceLanguage string `json:"sourceLanguage"`
	TargetLanguage string `json:"targetLanguage"`
	Status         string `json:"status"`
	UpdatedAt      string `json:"updatedAt"`
	MessageCount   int64  `json:"messageCount"`
}

type createRunRequest struct {
	Repo           string `json:"repo"`
	Branch         string `json:"branch"`
	SourceLanguage string `json:"sourceLanguage"`
	TargetLanguage string `json:"targetLanguage"`
	DbEnabled      bool   `json:"dbEnabled"`
}

// --- Helpers ---

var allAgentKeys = []string{
	"router", "source_analyzer", "business_logic", "code_generator",
	"db_migration", "test_generator", "reviewer", "commander", "github_connector",
}

func statusToPhase(s db.MigrationStatus) *string {
	m := map[db.MigrationStatus]string{
		db.MigrationStatusPlanning:     "planning",
		db.MigrationStatusAnalyzing:    "analysis",
		db.MigrationStatusTranslating:  "translation",
		db.MigrationStatusDbMigration:  "db_migration",
		db.MigrationStatusTesting:      "testing",
		db.MigrationStatusReviewing:    "review",
		db.MigrationStatusGeneratingPr: "pr_generation",
		db.MigrationStatusNeedsRework:  "review",
	}
	if phase, ok := m[s]; ok {
		return &phase
	}
	return nil
}

func pgTimestampPtr(ts pgtype.Timestamptz) *string {
	if !ts.Valid {
		return nil
	}
	s := ts.Time.UTC().Format(time.RFC3339)
	return &s
}

func repoOwnerName(repoURL string) (owner, name string) {
	clean := strings.TrimPrefix(repoURL, "https://github.com/")
	clean = strings.TrimSuffix(clean, ".git")
	clean = strings.TrimSuffix(clean, "/")
	parts := strings.SplitN(clean, "/", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return "", clean
}

func strPtr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func buildAgents(messages []db.AgentMessage) []agentRuntimeVM {
	lastAction := map[string]string{}
	for _, m := range messages {
		if m.CreatedAt.Valid {
			lastAction[m.AgentName] = m.CreatedAt.Time.UTC().Format(time.RFC3339)
		}
	}
	agents := make([]agentRuntimeVM, len(allAgentKeys))
	for i, key := range allAgentKeys {
		a := agentRuntimeVM{Key: key, Status: "idle"}
		if at, ok := lastAction[key]; ok {
			a.Status = "done"
			a.LastActionAt = &at
		}
		agents[i] = a
	}
	return agents
}

func toMessagesVM(messages []db.AgentMessage) []AgentMessageVM {
	out := make([]AgentMessageVM, 0, len(messages))
	for _, m := range messages {
		vm := AgentMessageVM{
			ID:          m.ID.String(),
			Agent:       m.AgentName,
			Type:        string(m.MessageType),
			Phase:       string(m.Phase),
			Summary:     m.Summary,
			TargetAgent: m.TargetAgent,
		}
		if m.RequiresAction != nil {
			vm.RequiresAction = *m.RequiresAction
		}
		if m.CreatedAt.Valid {
			vm.CreatedAt = m.CreatedAt.Time.UTC().Format(time.RFC3339)
		}
		if len(m.Payload) > 0 {
			var p map[string]interface{}
			if err := json.Unmarshal(m.Payload, &p); err == nil && len(p) > 0 {
				vm.Payload = p
			}
		}
		out = append(out, vm)
	}
	return out
}

func toProjectVM(p db.Project) projectVM {
	owner, name := repoOwnerName(strPtr(p.GithubRepoUrl))
	dbEnabled := p.EnableDbMigration != nil && *p.EnableDbMigration
	return projectVM{
		ID:             p.ID.String(),
		Name:           p.Name,
		RepoURL:        strPtr(p.GithubRepoUrl),
		RepoOwner:      owner,
		RepoName:       name,
		SourceLanguage: string(p.SourceLanguage),
		TargetLanguage: string(p.TargetLanguage),
		DbEnabled:      dbEnabled,
	}
}

// --- HTTP handlers ---

func (h *Handler) ListRuns(w http.ResponseWriter, r *http.Request) {
	companyID, err := uuid.Parse(middleware.GetCompanyID(r.Context()))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid company")
		return
	}

	rows, err := h.pool.Query(r.Context(), `
		SELECT mr.id, mr.run_number, p.name, p.source_language, p.target_language,
		       mr.status, mr.updated_at,
		       (SELECT COUNT(*) FROM agent_messages am
		        WHERE am.migration_run_id = mr.id AND am.company_id = mr.company_id) AS message_count
		FROM migration_runs mr
		JOIN projects p ON p.id = mr.project_id AND p.deleted_at IS NULL
		WHERE mr.company_id = $1
		ORDER BY mr.updated_at DESC
		LIMIT 20
	`, companyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list runs")
		return
	}
	defer rows.Close()

	result := make([]recentRunVM, 0)
	for rows.Next() {
		var id uuid.UUID
		var runNumber int32
		var projectName, srcLang, tgtLang, status string
		var updatedAt time.Time
		var messageCount int64
		if err := rows.Scan(&id, &runNumber, &projectName, &srcLang, &tgtLang, &status, &updatedAt, &messageCount); err != nil {
			continue
		}
		result = append(result, recentRunVM{
			ID:             id.String(),
			RunNumber:      runNumber,
			ProjectName:    projectName,
			SourceLanguage: srcLang,
			TargetLanguage: tgtLang,
			Status:         status,
			UpdatedAt:      updatedAt.UTC().Format(time.RFC3339),
			MessageCount:   messageCount,
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) GetRun(w http.ResponseWriter, r *http.Request) {
	companyID, err := uuid.Parse(middleware.GetCompanyID(r.Context()))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid company")
		return
	}
	runID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid run id")
		return
	}

	run, err := h.q.GetMigrationRun(r.Context(), companyID, runID)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "run not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get run")
		return
	}

	project, err := h.q.GetProject(r.Context(), companyID, run.ProjectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get project")
		return
	}

	messages, _ := h.q.ListAgentMessages(r.Context(), companyID, runID, 500, 0)

	bandRoomName := ""
	if room, err := h.q.GetBandRoomByRunID(r.Context(), companyID, runID); err == nil {
		bandRoomName = room.RoomName
	}

	artifacts, _ := h.fetchArtifacts(r.Context(), companyID, runID)
	dbPlan, _ := h.fetchDbPlan(r.Context(), companyID, runID)
	pr, _ := h.fetchPR(r.Context(), companyID, runID)

	status := "pending"
	if run.Status != nil {
		status = string(*run.Status)
	}

	var currentPhase *string
	if run.Status != nil {
		currentPhase = statusToPhase(*run.Status)
	}

	vm := runVM{
		ID:           run.ID.String(),
		RunNumber:    run.RunNumber,
		Project:      toProjectVM(project),
		Status:       status,
		CurrentPhase: currentPhase,
		BandRoomName: bandRoomName,
		SourceCommit: strPtr(run.SourceCommitSha),
		TargetBranch: strPtr(run.TargetBranch),
		StartedAt:    pgTimestampPtr(run.StartedAt),
		CompletedAt:  pgTimestampPtr(run.CompletedAt),
		ErrorMessage: run.ErrorMessage,
		Agents:       buildAgents(messages),
		Messages:     toMessagesVM(messages),
		Artifacts:    artifacts,
		DbPlan:       dbPlan,
		PR:           pr,
	}

	writeJSON(w, http.StatusOK, vm)
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

	var req createRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Repo == "" {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	projectID, err := h.findOrCreateProject(r.Context(), companyID, userID, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve project")
		return
	}

	runNumber, err := h.q.GetNextRunNumber(r.Context(), companyID, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get run number")
		return
	}

	branch := req.Branch
	if branch == "" {
		branch = "main"
	}
	s := db.MigrationStatusPending
	run, err := h.q.CreateMigrationRun(r.Context(), companyID, projectID, runNumber, &s, nil, nil, &branch, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create run")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"id":        run.ID.String(),
		"runNumber": run.RunNumber,
	})
}

func (h *Handler) StartRun(w http.ResponseWriter, r *http.Request) {
	companyID, err := uuid.Parse(middleware.GetCompanyID(r.Context()))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid company")
		return
	}
	runID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid run id")
		return
	}

	existing, err := h.q.GetMigrationRun(r.Context(), companyID, runID)
	if err != nil {
		writeError(w, http.StatusNotFound, "run not found")
		return
	}
	if existing.Status != nil && *existing.Status != db.MigrationStatusPending {
		writeError(w, http.StatusConflict, "run is not in pending state")
		return
	}

	project, err := h.q.GetProject(r.Context(), companyID, existing.ProjectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load project")
		return
	}

	// Kick off the Band collaboration room (create chat, add agents, post kickoff).
	rc := band.FerryRunContext{
		CompanyID:          companyID.String(),
		ProjectID:          existing.ProjectID.String(),
		MigrationRunID:     runID.String(),
		RepoFullName:       strPtr(project.GithubRepoUrl),
		SourceLanguage:     string(project.SourceLanguage),
		TargetLanguage:     string(project.TargetLanguage),
		DBMigrationEnabled: project.EnableDbMigration != nil && *project.EnableDbMigration,
	}
	bandChatID, err := h.band.StartFerryBandRoom(r.Context(), rc)
	if err != nil {
		failed := db.MigrationStatusFailed
		msg := "failed to start Band room: " + err.Error()
		_, _ = h.q.UpdateMigrationRunStatus(r.Context(), companyID, runID, &failed, &msg)
		writeError(w, http.StatusBadGateway, "failed to start Band collaboration room")
		return
	}

	// Persist the band room id + flip the run to planning/started.
	if _, err := h.pool.Exec(r.Context(),
		`UPDATE migration_runs SET band_room_id = $1, status = 'planning', started_at = NOW()
		 WHERE company_id = $2 AND id = $3`,
		bandChatID, companyID, runID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start run")
		return
	}

	desc := "Ferry migration room for " + strPtr(project.GithubRepoUrl)
	roomName := rc.RoomName()
	_, _ = h.q.CreateBandRoom(r.Context(), companyID, runID, bandChatID, roomName, &desc, []byte("{}"))

	writeJSON(w, http.StatusOK, map[string]string{"status": "planning", "bandChatId": bandChatID})
}

func (h *Handler) CancelRun(w http.ResponseWriter, r *http.Request) {
	companyID, err := uuid.Parse(middleware.GetCompanyID(r.Context()))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid company")
		return
	}
	runID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid run id")
		return
	}

	s := db.MigrationStatusFailed
	msg := "Cancelled by user"
	if _, err := h.q.UpdateMigrationRunStatus(r.Context(), companyID, runID, &s, &msg); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to cancel run")
		return
	}
	h.q.CompleteMigrationRun(r.Context(), companyID, runID, &s) //nolint

	writeJSON(w, http.StatusOK, map[string]string{"status": "failed"})
}

func (h *Handler) RerunRun(w http.ResponseWriter, r *http.Request) {
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
	runID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid run id")
		return
	}

	original, err := h.q.GetMigrationRun(r.Context(), companyID, runID)
	if err != nil {
		writeError(w, http.StatusNotFound, "run not found")
		return
	}

	runNumber, err := h.q.GetNextRunNumber(r.Context(), companyID, original.ProjectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get run number")
		return
	}

	s := db.MigrationStatusPending
	newRun, err := h.q.CreateMigrationRun(r.Context(), companyID, original.ProjectID, runNumber, &s, nil, nil, original.TargetBranch, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create rerun")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"id":        newRun.ID.String(),
		"runNumber": newRun.RunNumber,
	})
}

func (h *Handler) ApproveDbPlan(w http.ResponseWriter, r *http.Request) {
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
	runID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid run id")
		return
	}

	_, err = h.pool.Exec(r.Context(),
		`UPDATE db_migration_plans SET approved_by = $1, approved_at = NOW() WHERE company_id = $2 AND migration_run_id = $3`,
		userID, companyID, runID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to approve db plan")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"approved": true})
}

// StreamRun is an SSE endpoint. EventSource can't set custom headers, so the
// token may arrive as a query param instead of the Authorization header.
func (h *Handler) StreamRun(w http.ResponseWriter, r *http.Request) {
	// Accept token from query param (EventSource limitation) or header.
	token := r.URL.Query().Get("token")
	if token == "" {
		token = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}

	claims, err := h.authService.ValidateToken(token)
	if err != nil || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	runID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "invalid run id", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	ctx := r.Context()
	pubsub := h.rdb.Subscribe(ctx, "run:"+runID.String()+":messages")
	defer pubsub.Close()

	msgCh := pubsub.Channel()
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg, ok := <-msgCh:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", msg.Payload)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case <-ctx.Done():
			return
		}
	}
}

// PublishMessage publishes an agent message to the SSE channel for a run.
// Called by agent code after inserting a message into the DB.
func (h *Handler) PublishMessage(ctx context.Context, runID string, msg AgentMessageVM) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return h.rdb.Publish(ctx, "run:"+runID+":messages", string(data)).Err()
}

// --- Raw query helpers ---

func (h *Handler) fetchArtifacts(ctx context.Context, companyID, runID uuid.UUID) ([]artifactVM, error) {
	rows, err := h.pool.Query(ctx, `
		SELECT id, artifact_type, file_name, file_size, COALESCE(generated_by, '')
		FROM generated_artifacts
		WHERE company_id = $1 AND migration_run_id = $2
		ORDER BY created_at ASC
	`, companyID, runID)
	if err != nil {
		return []artifactVM{}, err
	}
	defer rows.Close()

	artifacts := make([]artifactVM, 0)
	for rows.Next() {
		var id uuid.UUID
		var artType, fileName, generatedBy string
		var fileSize int64
		if err := rows.Scan(&id, &artType, &fileName, &fileSize, &generatedBy); err != nil {
			continue
		}
		artifacts = append(artifacts, artifactVM{
			ID:        id.String(),
			Type:      artType,
			FileName:  fileName,
			SizeBytes: fileSize,
			CreatedBy: generatedBy,
		})
	}
	return artifacts, nil
}

func (h *Handler) fetchDbPlan(ctx context.Context, companyID, runID uuid.UUID) (*dbPlanVM, error) {
	var id uuid.UUID
	var riskLevel string
	var requiresDowntime bool
	var estimatedSeconds *int32
	var riskFactorsJSON []byte
	var approvedBy pgtype.UUID
	var approvedAt pgtype.Timestamptz
	var migrationSQL string

	err := h.pool.QueryRow(ctx, `
		SELECT id, COALESCE(risk_level::text, 'medium'), COALESCE(requires_downtime, false),
		       estimated_duration_seconds, risk_factors, approved_by, approved_at, migration_sql
		FROM db_migration_plans
		WHERE company_id = $1 AND migration_run_id = $2
		LIMIT 1
	`, companyID, runID).Scan(&id, &riskLevel, &requiresDowntime, &estimatedSeconds, &riskFactorsJSON, &approvedBy, &approvedAt, &migrationSQL)
	if err != nil {
		return nil, err
	}

	var riskFactors []string
	if len(riskFactorsJSON) > 0 {
		_ = json.Unmarshal(riskFactorsJSON, &riskFactors)
	}
	if riskFactors == nil {
		riskFactors = []string{}
	}

	estSec := 0
	if estimatedSeconds != nil {
		estSec = int(*estimatedSeconds)
	}

	preview := migrationSQL
	if len(preview) > 500 {
		preview = preview[:500] + "..."
	}

	plan := &dbPlanVM{
		ID:                  id.String(),
		RiskLevel:           riskLevel,
		RequiresDowntime:    requiresDowntime,
		EstimatedSeconds:    estSec,
		RiskFactors:         riskFactors,
		MigrationSqlPreview: preview,
	}

	if approvedBy.Valid {
		s := uuid.UUID(approvedBy.Bytes).String()
		plan.ApprovedBy = &s
	}
	if approvedAt.Valid {
		s := approvedAt.Time.UTC().Format(time.RFC3339)
		plan.ApprovedAt = &s
	}

	return plan, nil
}

func (h *Handler) fetchPR(ctx context.Context, companyID, runID uuid.UUID) (*prVM, error) {
	var prNumber int32
	var prURL, title string
	var prStatus *string
	var sourceBranch, targetBranch string

	err := h.pool.QueryRow(ctx, `
		SELECT pr_number, pr_url, title, status::text, source_branch, target_branch
		FROM pull_requests
		WHERE company_id = $1 AND migration_run_id = $2
		LIMIT 1
	`, companyID, runID).Scan(&prNumber, &prURL, &title, &prStatus, &sourceBranch, &targetBranch)
	if err != nil {
		return nil, err
	}

	status := "open"
	if prStatus != nil {
		status = *prStatus
	}

	return &prVM{
		Number:       prNumber,
		URL:          prURL,
		Title:        title,
		Status:       status,
		SourceBranch: sourceBranch,
		TargetBranch: targetBranch,
	}, nil
}

func (h *Handler) findOrCreateProject(ctx context.Context, companyID, userID uuid.UUID, req createRunRequest) (uuid.UUID, error) {
	var projectID uuid.UUID
	err := h.pool.QueryRow(ctx,
		`SELECT id FROM projects WHERE company_id = $1 AND github_repo_url = $2 AND deleted_at IS NULL LIMIT 1`,
		companyID, req.Repo,
	).Scan(&projectID)
	if err == nil {
		return projectID, nil
	}
	if err != pgx.ErrNoRows {
		return uuid.Nil, err
	}

	_, name := repoOwnerName(req.Repo)
	if name == "" {
		name = req.Repo
	}

	srcLang := db.SourceLanguage(req.SourceLanguage)
	tgtLang := db.TargetLanguage(req.TargetLanguage)
	dbEnabled := req.DbEnabled
	repoURL := req.Repo

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
