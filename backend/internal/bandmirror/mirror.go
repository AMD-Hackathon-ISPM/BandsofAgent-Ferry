package bandmirror

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/config"
	"github.com/ferry/backend/internal/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const mirrorChannel = "ferry:mirror"

// artifactPreviewLimit caps how much of each generated file is stored inline (in
// the DB row metadata) for the frontend preview. The full file lives in MinIO.
const artifactPreviewLimit = 16_000

// Mirror consumes agent messages published by the workers (Band has no
// transcript API), persists them to agent_messages, and streams them to the
// run's SSE channel for the frontend.
type Mirror struct {
	pool  *pgxpool.Pool
	rdb   *redis.Client
	blobs *storage.MinIOClient // generated-file storage; nil if MinIO unavailable

	mu   sync.Mutex
	runs map[string]runMeta // runID → company/project (cache)
}

type runMeta struct {
	company uuid.UUID
	project uuid.UUID
}

func New(pool *pgxpool.Pool, rdb *redis.Client, cfg *config.Config, store *storage.MinIOClient) *Mirror {
	if cfg.Band.Provider != "band" && cfg.Band.Provider != "http" {
		return nil
	}
	return &Mirror{pool: pool, rdb: rdb, blobs: store, runs: make(map[string]runMeta)}
}

// Run subscribes to the worker mirror channel until ctx is cancelled.
func (m *Mirror) Run(ctx context.Context) {
	sub := m.rdb.Subscribe(ctx, mirrorChannel)
	defer sub.Close()
	ch := sub.Channel()
	log.Println("band mirror subscribed")
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			m.handle(ctx, msg.Payload)
		}
	}
}

type incoming struct {
	RunID     string `json:"runId"`
	Agent     string `json:"agent"`
	ID        string `json:"id"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

func (m *Mirror) handle(ctx context.Context, payload string) {
	var in incoming
	if err := json.Unmarshal([]byte(payload), &in); err != nil || in.RunID == "" || in.ID == "" {
		return
	}
	runUUID, err := uuid.Parse(in.RunID)
	if err != nil {
		return
	}
	meta, ok := m.meta(ctx, runUUID)
	if !ok {
		return
	}

	createdAt := time.Now().UTC()
	if t, err := time.Parse(time.RFC3339, in.CreatedAt); err == nil {
		createdAt = t.UTC()
	}

	phase := phaseByKey(in.Agent)
	artifacts, mainContent := band.ParseArtifacts(in.Content)

	m.store(ctx, meta, runUUID, in.ID, in.Agent, typeByKey(in.Agent), phase, summarize(mainContent), mainContent, createdAt)
	for i, a := range artifacts {
		summary := fmt.Sprintf("Sandbox %s result: %s", a.Kind, a.Status)
		m.store(ctx, meta, runUUID, fmt.Sprintf("%s:art:%d", in.ID, i), in.Agent, "artifact_created", phase, summary, a.Body, createdAt)
	}

	// Once the file-producing stages have run, surface their generated files in
	// the frontend Outputs panel (MinIO blob + a previewable DB row).
	if in.Agent == "code_generator" || in.Agent == "test_generator" {
		m.syncArtifacts(ctx, meta, runUUID)
	}

	if in.Agent == "github_connector" {
		_, _ = m.pool.Exec(ctx, `
			UPDATE migration_runs SET status = 'completed', completed_at = NOW()
			WHERE id = $1 AND status NOT IN ('completed', 'failed')
		`, runUUID)
		// The run is done; reclaim the generated-file blobs. The DB rows (with
		// inline previews) stay, so the files remain visible in the UI.
		m.cleanupArtifacts(ctx, runUUID)
	}
}

// syncArtifacts mirrors the run's generated files (accumulated by the workers in
// Redis at ferry:files:{runID}) into MinIO + the generated_artifacts table so
// the frontend can list and preview them. Idempotent: a rework loop that
// regenerates files updates the existing rows instead of duplicating them.
func (m *Mirror) syncArtifacts(ctx context.Context, meta runMeta, runID uuid.UUID) {
	files, err := m.rdb.HGetAll(ctx, "ferry:files:"+runID.String()).Result()
	if err != nil || len(files) == 0 {
		return
	}
	for filePath, content := range files {
		artType := artifactTypeFor(filePath)
		storageKey := runID.String() + "/" + filePath
		size := int64(len(content))

		if m.blobs != nil {
			if err := m.blobs.Upload(ctx, storage.UploadInput{
				ObjectName:  storageKey,
				Reader:      bytes.NewReader([]byte(content)),
				Size:        size,
				ContentType: "text/plain; charset=utf-8",
			}); err != nil {
				log.Printf("mirror: artifact upload (%s): %v", storageKey, err)
			}
		}

		preview := content
		if len(preview) > artifactPreviewLimit {
			preview = preview[:artifactPreviewLimit] + "\n… (truncated)"
		}
		metadata, _ := json.Marshal(map[string]string{"preview": preview})

		var id uuid.UUID
		if err := m.pool.QueryRow(ctx,
			`SELECT id FROM generated_artifacts WHERE company_id=$1 AND migration_run_id=$2 AND file_path=$3`,
			meta.company, runID, filePath).Scan(&id); err == nil {
			_, _ = m.pool.Exec(ctx,
				`UPDATE generated_artifacts SET file_size=$1, storage_key=$2, metadata=$3, updated_at=NOW() WHERE id=$4`,
				size, storageKey, metadata, id)
			continue
		}
		if _, err := m.pool.Exec(ctx, `
			INSERT INTO generated_artifacts
				(company_id, project_id, migration_run_id, artifact_type, file_path, file_name, file_size, storage_key, generated_by, metadata)
			VALUES ($1,$2,$3,$4::artifact_type,$5,$6,$7,$8,$9,$10)
		`, meta.company, meta.project, runID, artType, filePath, path.Base(filePath), size, storageKey, generatedByFor(artType), metadata); err != nil {
			log.Printf("mirror: artifact insert (%s): %v", filePath, err)
		}
	}
}

// cleanupArtifacts removes the run's generated-file blobs from MinIO. The
// generated_artifacts rows (with inline previews) are intentionally kept.
func (m *Mirror) cleanupArtifacts(ctx context.Context, runID uuid.UUID) {
	if m.blobs == nil {
		return
	}
	keys, err := m.blobs.List(ctx, runID.String()+"/")
	if err != nil {
		log.Printf("mirror: artifact cleanup list (%s): %v", runID, err)
		return
	}
	for _, k := range keys {
		if err := m.blobs.Delete(ctx, k); err != nil {
			log.Printf("mirror: artifact cleanup delete (%s): %v", k, err)
		}
	}
}

// artifactTypeFor maps a generated file path to a generated_artifacts enum value.
func artifactTypeFor(filePath string) string {
	lower := strings.ToLower(filePath)
	if strings.HasSuffix(lower, "_test.go") ||
		strings.HasSuffix(lower, "_test.rs") ||
		strings.HasPrefix(lower, "tests/") ||
		strings.Contains(lower, "/tests/") {
		return "test_code"
	}
	return "target_code"
}

// generatedByFor attributes an artifact to the agent that produces that type, so
// the frontend shows the right agent glyph.
func generatedByFor(artType string) string {
	if artType == "test_code" {
		return "test_generator"
	}
	return "code_generator"
}

// meta resolves (and caches) the company/project for a run id.
func (m *Mirror) meta(ctx context.Context, runID uuid.UUID) (runMeta, bool) {
	key := runID.String()
	m.mu.Lock()
	if r, ok := m.runs[key]; ok {
		m.mu.Unlock()
		return r, true
	}
	m.mu.Unlock()

	var r runMeta
	if err := m.pool.QueryRow(ctx,
		`SELECT company_id, project_id FROM migration_runs WHERE id = $1`, runID,
	).Scan(&r.company, &r.project); err != nil {
		return runMeta{}, false
	}
	m.mu.Lock()
	m.runs[key] = r
	m.mu.Unlock()
	return r, true
}

func (m *Mirror) store(ctx context.Context, meta runMeta, runID uuid.UUID, bandMsgID, agent, mtype, phase, summary, content string, createdAt time.Time) {
	var exists bool
	_ = m.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM agent_messages WHERE migration_run_id = $1 AND band_message_id = $2)`,
		runID, bandMsgID).Scan(&exists)
	if exists {
		return
	}

	payload, _ := json.Marshal(map[string]interface{}{"content": content})
	_, err := m.pool.Exec(ctx, `
		INSERT INTO agent_messages
			(company_id, project_id, migration_run_id, band_room_id, band_message_id,
			 agent_name, message_type, phase, summary, payload, created_at)
		VALUES ($1,$2,$3,'',$4,$5,$6,$7,$8,$9,$10)
	`, meta.company, meta.project, runID, bandMsgID, agent, mtype, phase, summary, payload, createdAt)
	if err != nil {
		log.Printf("mirror: insert (run %s): %v", runID, err)
		return
	}

	vm := map[string]interface{}{
		"id":        bandMsgID,
		"agent":     agent,
		"type":      mtype,
		"phase":     phase,
		"summary":   summary,
		"payload":   map[string]interface{}{"content": content},
		"createdAt": createdAt.Format(time.RFC3339),
	}
	if data, err := json.Marshal(vm); err == nil {
		m.rdb.Publish(ctx, "run:"+runID.String()+":messages", string(data))
	}
}

func phaseByKey(key string) string {
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

func typeByKey(key string) string {
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

// summarize produces a clean one-line headline for the feed: markdown markers
// stripped and whitespace collapsed, so the teaser reads as prose rather than a
// run-on of asterisks. The full, formatted body is rendered separately by the
// frontend from the message payload.
func summarize(content string) string {
	s := content
	for _, tok := range []string{"**", "`", "######", "#####", "####", "###", "##", "#", ">"} {
		s = strings.ReplaceAll(s, tok, "")
	}
	s = strings.Join(strings.Fields(s), " ") // collapse all whitespace incl. newlines
	if r := []rune(s); len(r) > 200 {
		s = strings.TrimSpace(string(r[:200])) + "…"
	}
	if s == "" {
		s = "(no content)"
	}
	return s
}
