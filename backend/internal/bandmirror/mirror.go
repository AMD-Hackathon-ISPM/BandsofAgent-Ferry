package bandmirror

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/config"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const mirrorChannel = "ferry:mirror"

// Mirror consumes agent messages published by the workers (Band has no
// transcript API), persists them to agent_messages, and streams them to the
// run's SSE channel for the frontend.
type Mirror struct {
	pool *pgxpool.Pool
	rdb  *redis.Client

	mu   sync.Mutex
	runs map[string]runMeta // runID → company/project (cache)
}

type runMeta struct {
	company uuid.UUID
	project uuid.UUID
}

func New(pool *pgxpool.Pool, rdb *redis.Client, cfg *config.Config) *Mirror {
	if cfg.Band.Provider != "band" && cfg.Band.Provider != "http" {
		return nil
	}
	return &Mirror{pool: pool, rdb: rdb, runs: make(map[string]runMeta)}
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

	if in.Agent == "github_connector" {
		_, _ = m.pool.Exec(ctx, `
			UPDATE migration_runs SET status = 'completed', completed_at = NOW()
			WHERE id = $1 AND status NOT IN ('completed', 'failed')
		`, runUUID)
	}
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

func summarize(content string) string {
	s := strings.TrimSpace(content)
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "  ", " ")
	if len(s) > 160 {
		s = s[:160] + "…"
	}
	if s == "" {
		s = "(no content)"
	}
	return s
}
