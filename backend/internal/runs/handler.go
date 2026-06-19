package runs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/ferry/backend/internal/auth"
	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/db"
	ghpkg "github.com/ferry/backend/internal/github"
	"github.com/ferry/backend/internal/guest"
	"github.com/ferry/backend/internal/http/middleware"
	"github.com/ferry/backend/internal/scheduler"
	"github.com/ferry/backend/internal/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	pool               *pgxpool.Pool
	q                  *db.Queries
	rdb                *redis.Client
	authService        *auth.Service
	band               *band.Service
	sched              *scheduler.Scheduler
	blobs              *storage.MinIOClient
	validateRepoAccess repoAccessValidator
	guestPolicy        *guest.RepoPolicy
	guestAdmission     *guest.Admission
}

type repoAccessValidator func(context.Context, string, string, bool) error

func NewHandler(pool *pgxpool.Pool, q *db.Queries, rdb *redis.Client, authService *auth.Service, bandSvc *band.Service, sched *scheduler.Scheduler, blobs *storage.MinIOClient, ghTokens ...*ghpkg.UserTokens) *Handler {
	h := &Handler{pool: pool, q: q, rdb: rdb, authService: authService, band: bandSvc, sched: sched, blobs: blobs}
	if len(ghTokens) > 0 && ghTokens[0] != nil {
		h.validateRepoAccess = gitHubRepoAccessValidator(ghTokens[0], "")
	}
	return h
}

func (h *Handler) ConfigureGuest(policy *guest.RepoPolicy, admission *guest.Admission, guestPAT string) {
	h.guestPolicy = policy
	h.guestAdmission = admission
	if h.validateRepoAccess != nil {
		existing := h.validateRepoAccess
		h.validateRepoAccess = func(ctx context.Context, userID, repo string, isGuest bool) error {
			if !isGuest {
				return existing(ctx, userID, repo, false)
			}
			owner, name := repoOwnerName(repo)
			if owner == "" || name == "" {
				return ghpkg.ErrNotFound
			}
			if guestPAT == "" {
				return ghpkg.ErrGuestCredentialsUnavailable
			}
			_, err := ghpkg.NewClient(guestPAT).ResolveRepo(ctx, owner, name)
			return err
		}
	}
}

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
	FilePath  string  `json:"filePath"`
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
	DbEnabled    bool             `json:"dbEnabled"`
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

func gitHubRepoAccessValidator(tokens *ghpkg.UserTokens, guestPAT string) repoAccessValidator {
	return func(ctx context.Context, userID, repo string, isGuest bool) error {
		owner, name := repoOwnerName(repo)
		if owner == "" || name == "" {
			return ghpkg.ErrNotFound
		}
		token := tokens.Token(ctx, userID)
		if isGuest {
			token = guestPAT
			if token == "" {
				return ghpkg.ErrGuestCredentialsUnavailable
			}
		}
		_, err := ghpkg.NewClient(token).ResolveRepo(ctx, owner, name)
		return err
	}
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

func buildAgentsFromVM(messages []AgentMessageVM) []agentRuntimeVM {
	lastAction := map[string]string{}
	for _, m := range messages {
		if m.CreatedAt != "" {
			lastAction[m.Agent] = m.CreatedAt
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

func transcriptPhaseByKey(key string) string {
	switch key {
	case "router":
		return "planning"
	case "source_analyzer", "business_logic":
		return "analysis"
	case "code_generator":
		return "translation"
	case "db_migration":
		return "db_migration"
	case "test_generator":
		return "testing"
	case "reviewer", "commander":
		return "review"
	case "github_connector":
		return "pr_generation"
	default:
		return "planning"
	}
}

func transcriptTypeByKey(key string) string {
	switch key {
	case "reviewer":
		return "review"
	case "commander":
		return "decision"
	case "github_connector":
		return "artifact_created"
	default:
		return "handoff"
	}
}

func summarizeTranscript(content string) string {
	s := content
	for _, tok := range []string{"**", "`", "######", "#####", "####", "###", "##", "#", ">"} {
		s = strings.ReplaceAll(s, tok, "")
	}
	s = strings.Join(strings.Fields(s), " ")
	runes := []rune(s)
	if len(runes) > 200 {
		s = strings.TrimSpace(string(runes[:200])) + "..."
	}
	if s == "" {
		s = "(no content)"
	}
	return s
}

func toTranscriptMessagesVM(messages []band.TranscriptMessage, bandSvc *band.Service) []AgentMessageVM {
	out := make([]AgentMessageVM, 0, len(messages))
	for _, m := range messages {
		agent := bandSvc.AgentKeyByID(m.SenderID)
		if agent == "" {
			continue
		}
		content := m.Content
		for _, mention := range m.Metadata.Mentions {
			content = strings.ReplaceAll(content, "@[["+mention.ID+"]]", "@"+mention.Name)
		}
		content = band.StripCtx(content)
		vm := AgentMessageVM{
			ID:        m.ID,
			Agent:     agent,
			Type:      transcriptTypeByKey(agent),
			Phase:     transcriptPhaseByKey(agent),
			Summary:   summarizeTranscript(content),
			CreatedAt: m.InsertedAt,
		}
		if content != "" {
			vm.Payload = map[string]interface{}{"content": content}
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
	messageVMs := toMessagesVM(messages)
	if len(messageVMs) == 0 {
		if chatID := strPtr(run.BandRoomID); chatID != "" {
			if transcript, err := h.band.ListTranscriptMessages(r.Context(), chatID); err == nil {
				messageVMs = toTranscriptMessagesVM(transcript, h.band)
			}
		}
	}

	bandRoomName := ""
	if room, err := h.q.GetBandRoomByRunID(r.Context(), companyID, runID); err == nil {
		bandRoomName = room.RoomName
	}

	artifacts, _ := h.fetchArtifacts(r.Context(), companyID, runID)
	dbPlan, _ := h.fetchDbPlan(r.Context(), companyID, runID)
	pr, _ := h.fetchPR(r.Context(), companyID, runID)

	var dbEnabled bool
	_ = h.pool.QueryRow(r.Context(),
		`SELECT db_migration_enabled FROM migration_runs WHERE company_id = $1 AND id = $2`,
		companyID, runID).Scan(&dbEnabled)

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
		DbEnabled:    dbEnabled,
		Agents:       buildAgents(messages),
		Messages:     messageVMs,
		Artifacts:    artifacts,
		DbPlan:       dbPlan,
		PR:           pr,
	}
	if len(messages) == 0 && len(messageVMs) > 0 {
		vm.Agents = buildAgentsFromVM(messageVMs)
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
	isGuest := middleware.IsGuest(r.Context())
	if isGuest && !h.guestPolicy.Allowed(req.Repo) {
		writeError(w, http.StatusForbidden, "repository is not available to guests")
		return
	}
	var release func()
	if isGuest {
		release, err = h.guestAdmission.AdmitRun(r.Context(), companyID.String(), guest.ClientIP(r))
		if err != nil {
			writeGuestAdmissionError(w, err)
			return
		}
		defer release()
	}
	if h.validateRepoAccess != nil {
		if err := h.validateRepoAccess(r.Context(), userID.String(), req.Repo, isGuest); err != nil {
			if errors.Is(err, ghpkg.ErrNotFound) {
				writeError(w, http.StatusNotFound, "repository not found")
				return
			}
			if errors.Is(err, ghpkg.ErrGuestCredentialsUnavailable) {
				writeError(w, http.StatusServiceUnavailable, "guest GitHub access is unavailable")
				return
			}
			writeError(w, http.StatusBadGateway, "failed to reach GitHub")
			return
		}
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

	// Persist the DB-migration choice on the run (per-run, not per-project).
	if _, err := h.pool.Exec(r.Context(),
		`UPDATE migration_runs SET db_migration_enabled = $1 WHERE company_id = $2 AND id = $3`,
		req.DbEnabled, companyID, run.ID); err != nil {
		log.Printf("runs: persist db_migration_enabled failed: %v", err)
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
	if middleware.IsGuest(r.Context()) {
		repo, repoErr := h.repoForRun(r.Context(), companyID, runID)
		if repoErr != nil || !h.guestPolicy.Allowed(repo) {
			writeError(w, http.StatusForbidden, "repository is not available to guests")
			return
		}
	}
	if existing.Status != nil && *existing.Status != db.MigrationStatusPending {
		writeError(w, http.StatusConflict, "run is not in pending state")
		return
	}

	// Admit through the scheduler: starts now if a concurrency slot is free,
	// otherwise the run is queued and started when a slot opens.
	started := h.sched.Admit(r.Context(), runID)
	status := "queued"
	if started {
		status = "planning"
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
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
	isGuest := middleware.IsGuest(r.Context())
	if isGuest {
		repo, repoErr := h.repoForRun(r.Context(), companyID, runID)
		if repoErr != nil || !h.guestPolicy.Allowed(repo) {
			writeError(w, http.StatusForbidden, "repository is not available to guests")
			return
		}
	}
	var release func()
	if isGuest {
		release, err = h.guestAdmission.AdmitRun(r.Context(), companyID.String(), guest.ClientIP(r))
		if err != nil {
			writeGuestAdmissionError(w, err)
			return
		}
		defer release()
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

	// Carry the original run's DB-migration choice over to the rerun.
	if _, err := h.pool.Exec(r.Context(),
		`UPDATE migration_runs SET db_migration_enabled =
		   (SELECT db_migration_enabled FROM migration_runs WHERE company_id = $1 AND id = $2)
		 WHERE company_id = $1 AND id = $3`,
		companyID, runID, newRun.ID); err != nil {
		log.Printf("runs: carry db_migration_enabled to rerun failed: %v", err)
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

func (h *Handler) repoForRun(ctx context.Context, companyID, runID uuid.UUID) (string, error) {
	var repo string
	err := h.pool.QueryRow(ctx, `
		SELECT COALESCE(p.github_repo_url, '')
		FROM migration_runs mr
		JOIN projects p ON p.id = mr.project_id AND p.company_id = mr.company_id
		WHERE mr.company_id = $1 AND mr.id = $2
	`, companyID, runID).Scan(&repo)
	return repo, err
}

func writeGuestAdmissionError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, guest.ErrRateLimited):
		writeError(w, http.StatusTooManyRequests, "guest run creation rate limit exceeded")
	case errors.Is(err, guest.ErrSessionCap):
		writeError(w, http.StatusConflict, "guest session already has an active run")
	case errors.Is(err, guest.ErrGlobalCap):
		writeError(w, http.StatusServiceUnavailable, "guest run queue is full")
	default:
		writeError(w, http.StatusServiceUnavailable, "guest run admission is unavailable")
	}
}

func (h *Handler) GetArtifactContent(w http.ResponseWriter, r *http.Request) {
	if h.blobs == nil {
		writeError(w, http.StatusNotFound, "artifact content unavailable")
		return
	}
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
	artifactID, err := uuid.Parse(r.PathValue("artifactId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid artifact id")
		return
	}

	var storageKey string
	err = h.pool.QueryRow(r.Context(), `
		SELECT storage_key
		FROM generated_artifacts
		WHERE company_id = $1 AND migration_run_id = $2 AND id = $3
	`, companyID, runID, artifactID).Scan(&storageKey)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "artifact not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get artifact")
		return
	}

	if _, err := h.blobs.GetObjectInfo(r.Context(), storageKey); err != nil {
		writeError(w, http.StatusNotFound, "artifact content unavailable")
		return
	}
	body, err := h.blobs.Download(r.Context(), storageKey)
	if err != nil {
		writeError(w, http.StatusNotFound, "artifact content unavailable")
		return
	}
	defer body.Close()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, body); err != nil {
		log.Printf("runs: stream artifact %s failed: %v", artifactID, err)
	}
}

func (h *Handler) StreamRun(w http.ResponseWriter, r *http.Request) {

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
	companyID, err := uuid.Parse(claims.CompanyID)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var owned bool
	if err := h.pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM migration_runs WHERE id = $1 AND company_id = $2)`, runID, companyID).Scan(&owned); err != nil || !owned {
		http.Error(w, "forbidden", http.StatusForbidden)
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

func (h *Handler) PublishMessage(ctx context.Context, runID string, msg AgentMessageVM) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return h.rdb.Publish(ctx, "run:"+runID+":messages", string(data)).Err()
}

func (h *Handler) fetchArtifacts(ctx context.Context, companyID, runID uuid.UUID) ([]artifactVM, error) {
	rows, err := h.pool.Query(ctx, `
		SELECT id, artifact_type, file_name, file_path, file_size, COALESCE(generated_by, ''), COALESCE(metadata, '{}')
		FROM generated_artifacts
		WHERE company_id = $1 AND migration_run_id = $2
		ORDER BY file_path ASC
	`, companyID, runID)
	if err != nil {
		return []artifactVM{}, err
	}
	defer rows.Close()

	artifacts := make([]artifactVM, 0)
	for rows.Next() {
		var id uuid.UUID
		var artType, fileName, filePath, generatedBy string
		var fileSize int64
		var metaJSON []byte
		if err := rows.Scan(&id, &artType, &fileName, &filePath, &fileSize, &generatedBy, &metaJSON); err != nil {
			continue
		}
		a := artifactVM{
			ID:        id.String(),
			Type:      artType,
			FileName:  fileName,
			FilePath:  filePath,
			SizeBytes: fileSize,
			CreatedBy: generatedBy,
		}
		if len(metaJSON) > 0 {
			var meta struct {
				Preview string `json:"preview"`
			}
			if json.Unmarshal(metaJSON, &meta) == nil && meta.Preview != "" {
				p := meta.Preview
				a.Preview = &p
			}
		}
		artifacts = append(artifacts, a)
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
