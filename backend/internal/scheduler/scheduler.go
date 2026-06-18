// Package scheduler admits migration runs up to a fixed number of concurrency
// slots (one per provider API key) and queues the rest in Redis. A run pinned to
// slot i uses provider key i, so concurrent runs don't share a key's rate limit.
package scheduler

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const (
	queueKey       = "ferry:run:queue"
	slotKeyPrefix  = "ferry:run:slot:"
	slotTTL        = 2 * time.Hour
	reconcileEvery = 8 * time.Second
	// activeStatuses occupy a slot.
	activeStatuses = `('planning','analyzing','translating','db_migration','testing','reviewing','generating_pr')`
)

type Scheduler struct {
	pool       *pgxpool.Pool
	q          *db.Queries
	rdb        *redis.Client
	band       *band.Service
	slots      int
	staleAfter time.Duration

	mu sync.Mutex // serializes slot allocation (single api instance)
}

func New(pool *pgxpool.Pool, q *db.Queries, rdb *redis.Client, bandSvc *band.Service, slots int, staleAfter time.Duration) *Scheduler {
	if slots < 1 {
		slots = 1
	}
	if staleAfter <= 0 {
		staleAfter = 30 * time.Minute
	}
	return &Scheduler{pool: pool, q: q, rdb: rdb, band: bandSvc, slots: slots, staleAfter: staleAfter}
}

func slotKey(runID string) string { return slotKeyPrefix + runID }

// Admit starts a run immediately if a slot is free, otherwise queues it.
// Returns true if the run was started (false = queued or failed).
func (s *Scheduler) Admit(ctx context.Context, runID uuid.UUID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	slot, ok := s.freeSlot(ctx)
	if !ok {
		s.rdb.RPush(ctx, queueKey, runID.String())
		s.setStatus(ctx, runID, "queued")
		log.Printf("scheduler: run %s queued (all %d slots busy)", runID, s.slots)
		return false
	}
	if err := s.start(ctx, runID, slot); err != nil {
		log.Printf("scheduler: start run %s failed: %v", runID, err)
		s.fail(ctx, runID, "failed to start: "+err.Error())
		return false
	}
	return true
}

// Run is the reconcile loop: it frees slots held by completed/failed/stale runs
// and admits queued runs as capacity opens. Self-healing across restarts since
// all state lives in Postgres + Redis.
func (s *Scheduler) Run(ctx context.Context) {
	t := time.NewTicker(reconcileEvery)
	defer t.Stop()
	s.reconcile(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.reconcile(ctx)
		}
	}
}

func (s *Scheduler) reconcile(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.failStaleRuns(ctx)

	for {
		slot, ok := s.freeSlot(ctx)
		if !ok {
			return
		}
		runID, err := s.rdb.LPop(ctx, queueKey).Result()
		if errors.Is(err, redis.Nil) || runID == "" {
			return
		}
		if err != nil {
			return
		}
		id, err := uuid.Parse(runID)
		if err != nil {
			continue
		}
		// Skip runs that were cancelled while queued.
		if !s.isQueueable(ctx, id) {
			continue
		}
		if err := s.start(ctx, id, slot); err != nil {
			log.Printf("scheduler: start queued run %s failed: %v", id, err)
			s.fail(ctx, id, "failed to start: "+err.Error())
		}
	}
}

// freeSlot returns the lowest slot index not held by an active run. Caller holds mu.
func (s *Scheduler) freeSlot(ctx context.Context) (int, bool) {
	used := s.usedSlots(ctx)
	for i := 0; i < s.slots; i++ {
		if !used[i] {
			return i, true
		}
	}
	return 0, false
}

func (s *Scheduler) usedSlots(ctx context.Context) map[int]bool {
	used := map[int]bool{}
	rows, err := s.pool.Query(ctx,
		`SELECT id FROM migration_runs WHERE status IN `+activeStatuses+
			` AND started_at > NOW() - $1::interval`,
		s.staleInterval())
	if err != nil {
		return used
	}
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, id := range ids {
		if v, err := s.rdb.Get(ctx, slotKey(id.String())).Result(); err == nil {
			if n, err := strconv.Atoi(v); err == nil {
				used[n] = true
			}
		}
	}
	return used
}

// start loads the run + project, kicks off the Band room on the given slot, and
// marks the run planning. Caller holds mu.
func (s *Scheduler) start(ctx context.Context, runID uuid.UUID, slot int) error {
	var companyID, projectID, createdBy uuid.UUID
	var branch *string
	var dbEnabled bool
	if err := s.pool.QueryRow(ctx,
		`SELECT company_id, project_id, target_branch, created_by, db_migration_enabled
		 FROM migration_runs WHERE id = $1`, runID,
	).Scan(&companyID, &projectID, &branch, &createdBy, &dbEnabled); err != nil {
		return fmt.Errorf("load run: %w", err)
	}

	var repoURL *string
	var srcLang, tgtLang string
	if err := s.pool.QueryRow(ctx,
		`SELECT github_repo_url, source_language, target_language FROM projects WHERE id = $1`, projectID,
	).Scan(&repoURL, &srcLang, &tgtLang); err != nil {
		return fmt.Errorf("load project: %w", err)
	}

	rc := band.FerryRunContext{
		CompanyID:          companyID.String(),
		ProjectID:          projectID.String(),
		MigrationRunID:     runID.String(),
		RepoFullName:       deref(repoURL),
		Branch:             deref(branch),
		SourceLanguage:     srcLang,
		TargetLanguage:     tgtLang,
		DBMigrationEnabled: dbEnabled,
		User:               createdBy.String(),
		Slot:               slot,
	}

	chatID, err := s.band.StartFerryBandRoom(ctx, rc)
	if err != nil {
		return fmt.Errorf("start band room: %w", err)
	}

	// Pin the slot to this run for the reconcile/usedSlots accounting.
	s.rdb.Set(ctx, slotKey(runID.String()), strconv.Itoa(slot), slotTTL)

	if _, err := s.pool.Exec(ctx,
		`UPDATE migration_runs SET band_room_id = $1, status = 'planning', started_at = NOW() WHERE id = $2`,
		chatID, runID,
	); err != nil {
		log.Printf("scheduler: persist band room on run %s: %v", runID, err)
	}

	desc := "Ferry migration room for " + deref(repoURL)
	if _, err := s.q.CreateBandRoom(ctx, companyID, runID, chatID, rc.RoomName(), &desc, []byte("{}")); err != nil {
		log.Printf("scheduler: persist band_rooms for run %s: %v", runID, err)
	}
	log.Printf("scheduler: run %s started on slot %d (band %s)", runID, slot, chatID)
	return nil
}

func (s *Scheduler) isQueueable(ctx context.Context, runID uuid.UUID) bool {
	var status string
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(status::text, '') FROM migration_runs WHERE id = $1`, runID,
	).Scan(&status); err != nil {
		return false
	}
	return status == "queued" || status == "pending"
}

func (s *Scheduler) failStaleRuns(ctx context.Context) {
	_, _ = s.pool.Exec(ctx,
		`UPDATE migration_runs
		 SET status = 'failed', error_message = 'Timed out', completed_at = NOW()
		 WHERE status IN `+activeStatuses+` AND started_at <= NOW() - $1::interval`,
		s.staleInterval())
}

func (s *Scheduler) setStatus(ctx context.Context, runID uuid.UUID, status string) {
	_, _ = s.pool.Exec(ctx, `UPDATE migration_runs SET status = $1 WHERE id = $2`, status, runID)
}

func (s *Scheduler) fail(ctx context.Context, runID uuid.UUID, msg string) {
	_, _ = s.pool.Exec(ctx,
		`UPDATE migration_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
		msg, runID)
}

func (s *Scheduler) staleInterval() string {
	return fmt.Sprintf("%d seconds", int(s.staleAfter.Seconds()))
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
