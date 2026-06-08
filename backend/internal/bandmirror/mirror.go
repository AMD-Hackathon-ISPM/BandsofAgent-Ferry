// Package bandmirror polls Band chat transcripts for active migration runs and
// mirrors new agent messages into the local agent_messages table + Redis, so
// the existing GET /api/runs/{id} + SSE stream surface the Band collaboration
// in the frontend with no frontend changes.
package bandmirror

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/config"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Mirror struct {
	pool     *pgxpool.Pool
	rdb      *redis.Client
	client   *band.AgentClient // acts as Router (a participant) to read transcripts
	keyByID  map[string]string // band agent id → internal agent key
	interval time.Duration
}

// New builds a Mirror. Returns nil if Band isn't configured for real use.
func New(pool *pgxpool.Pool, rdb *redis.Client, cfg *config.Config) *Mirror {
	routerKey := cfg.Band.Agent("router").APIKey
	if (cfg.Band.Provider != "band" && cfg.Band.Provider != "http") || routerKey == "" {
		return nil
	}
	keyByID := make(map[string]string)
	for key, a := range cfg.Band.Agents {
		if a.ID != "" {
			keyByID[a.ID] = key
		}
	}
	return &Mirror{
		pool:     pool,
		rdb:      rdb,
		client:   band.NewAgentClient(cfg.Band.BaseURL+"/agent", routerKey),
		keyByID:  keyByID,
		interval: 2 * time.Second,
	}
}

// Run polls until ctx is cancelled.
func (m *Mirror) Run(ctx context.Context) {
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()
	log.Println("band mirror started")
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.poll(ctx)
		}
	}
}

type activeRun struct {
	id        uuid.UUID
	companyID uuid.UUID
	projectID uuid.UUID
	chatID    string
}

func (m *Mirror) poll(ctx context.Context) {
	rows, err := m.pool.Query(ctx, `
		SELECT id, company_id, project_id, band_room_id
		FROM migration_runs
		WHERE band_room_id IS NOT NULL AND band_room_id <> ''
		  AND status NOT IN ('completed', 'failed')
	`)
	if err != nil {
		log.Printf("mirror: query active runs: %v", err)
		return
	}
	var runs []activeRun
	for rows.Next() {
		var r activeRun
		var chat *string
		if err := rows.Scan(&r.id, &r.companyID, &r.projectID, &chat); err != nil {
			continue
		}
		if chat != nil {
			r.chatID = *chat
		}
		runs = append(runs, r)
	}
	rows.Close()

	for _, r := range runs {
		m.mirrorRun(ctx, r)
	}
}

func (m *Mirror) mirrorRun(ctx context.Context, r activeRun) {
	msgs, err := m.client.ListMessages(ctx, r.chatID)
	if err != nil {
		log.Printf("mirror: list messages (run %s): %v", r.id, err)
		return
	}

	// Which Band message ids are already mirrored for this run?
	seen := make(map[string]bool)
	existing, err := m.pool.Query(ctx,
		`SELECT band_message_id FROM agent_messages WHERE migration_run_id = $1 AND band_message_id IS NOT NULL`, r.id)
	if err == nil {
		for existing.Next() {
			var id *string
			if existing.Scan(&id) == nil && id != nil {
				seen[*id] = true
			}
		}
		existing.Close()
	}

	for _, msg := range msgs {
		if seen[msg.ID] {
			continue
		}
		key, ok := m.keyByID[msg.SenderID]
		if !ok {
			continue // only mirror known Ferry agents (skip humans/unknown)
		}
		m.insertAndPublish(ctx, r, key, msg)
	}
}

func (m *Mirror) insertAndPublish(ctx context.Context, r activeRun, agentKey string, msg band.TranscriptMessage) {
	phase := phaseByKey(agentKey)
	mtype := typeByKey(agentKey)
	content := cleanMentions(msg.Content, msg.Metadata.Mentions)
	summary := summarize(content)
	payload, _ := json.Marshal(map[string]interface{}{"content": content})

	createdAt := time.Now().UTC()
	if t, err := time.Parse(time.RFC3339, msg.InsertedAt); err == nil {
		createdAt = t.UTC()
	}

	var targetAgent *string
	if len(msg.Metadata.Mentions) > 0 {
		if tk, ok := m.keyByID[msg.Metadata.Mentions[0].ID]; ok {
			targetAgent = &tk
		}
	}

	_, err := m.pool.Exec(ctx, `
		INSERT INTO agent_messages
			(company_id, project_id, migration_run_id, band_room_id, band_message_id,
			 agent_name, message_type, phase, summary, payload, target_agent, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
	`, r.companyID, r.projectID, r.id, r.chatID, msg.ID,
		agentKey, mtype, phase, summary, payload, targetAgent, createdAt)
	if err != nil {
		log.Printf("mirror: insert message (run %s): %v", r.id, err)
		return
	}

	// Publish to the SSE channel in the shape the frontend expects.
	vm := map[string]interface{}{
		"id":        msg.ID,
		"agent":     agentKey,
		"type":      mtype,
		"phase":     phase,
		"summary":   summary,
		"payload":   map[string]interface{}{"content": content},
		"createdAt": createdAt.Format(time.RFC3339),
	}
	if targetAgent != nil {
		vm["targetAgent"] = *targetAgent
	}
	if data, err := json.Marshal(vm); err == nil {
		m.rdb.Publish(ctx, "run:"+r.id.String()+":messages", string(data))
	}

	// When the GitHub Connector reports completion, close out the run.
	if agentKey == "github_connector" {
		_, _ = m.pool.Exec(ctx, `
			UPDATE migration_runs SET status = 'completed', completed_at = NOW()
			WHERE id = $1 AND status NOT IN ('completed', 'failed')
		`, r.id)
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

// cleanMentions rewrites Band's "@[[<agent-id>]]" mention tokens into readable
// "@Name" references using the message's mention metadata.
func cleanMentions(content string, mentions []band.Mention) string {
	for _, mn := range mentions {
		content = strings.ReplaceAll(content, "@[["+mn.ID+"]]", "@"+mn.Name)
	}
	return content
}

// summarize produces a short single-line summary from message content.
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
