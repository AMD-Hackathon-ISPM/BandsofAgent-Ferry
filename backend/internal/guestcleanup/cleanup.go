package guestcleanup

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/ferry/backend/internal/band"
	ghpkg "github.com/ferry/backend/internal/github"
	"github.com/ferry/backend/internal/guest"
	"github.com/ferry/backend/internal/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Cleaner struct {
	pool     *pgxpool.Pool
	rdb      *redis.Client
	blobs    *storage.MinIOClient
	band     *band.Service
	github   *ghpkg.Client
	policy   *guest.RepoPolicy
	ttl      time.Duration
	interval time.Duration
}

type expiredGuest struct {
	userID    uuid.UUID
	companyID uuid.UUID
}

type runResource struct {
	id         uuid.UUID
	repo       string
	prNumber   int
	bandChatID string
}

func New(pool *pgxpool.Pool, rdb *redis.Client, blobs *storage.MinIOClient, bandService *band.Service, guestPAT string, policy *guest.RepoPolicy, ttl time.Duration) *Cleaner {
	interval := time.Hour
	if ttl/4 < interval {
		interval = ttl / 4
	}
	if interval < 15*time.Minute {
		interval = 15 * time.Minute
	}
	return &Cleaner{pool: pool, rdb: rdb, blobs: blobs, band: bandService, github: ghpkg.NewClient(guestPAT), policy: policy, ttl: ttl, interval: interval}
}

func (c *Cleaner) Run(ctx context.Context) {
	c.Sweep(ctx)
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.Sweep(ctx)
		}
	}
}

func (c *Cleaner) Sweep(ctx context.Context) {
	guests, err := c.expired(ctx)
	if err != nil {
		log.Printf("guest cleanup: list expired guests: %v", err)
		return
	}
	for _, guestIdentity := range guests {
		if err := c.purge(ctx, guestIdentity); err != nil {
			log.Printf("guest cleanup: purge user %s: %v", guestIdentity.userID, err)
		}
	}
}

func (c *Cleaner) expired(ctx context.Context) ([]expiredGuest, error) {
	rows, err := c.pool.Query(ctx, `
		SELECT u.id, m.company_id
		FROM users u
		JOIN memberships m ON m.user_id = u.id
		WHERE u.is_guest = true AND u.created_at < $1
	`, time.Now().Add(-c.ttl))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var guests []expiredGuest
	for rows.Next() {
		var item expiredGuest
		if err := rows.Scan(&item.userID, &item.companyID); err != nil {
			return nil, err
		}
		guests = append(guests, item)
	}
	return guests, rows.Err()
}

func (c *Cleaner) purge(ctx context.Context, identity expiredGuest) error {
	runs, err := c.runResources(ctx, identity.companyID)
	if err != nil {
		return fmt.Errorf("list run resources: %w", err)
	}
	artifacts, err := c.artifactKeys(ctx, identity.companyID)
	if err != nil {
		return fmt.Errorf("list artifacts: %w", err)
	}
	for _, key := range artifacts {
		if c.blobs != nil {
			if err := c.blobs.Delete(ctx, key); err != nil {
				log.Printf("guest cleanup: delete artifact %s: %v", key, err)
			}
		}
	}
	for _, run := range runs {
		c.deleteRedis(ctx, run.id)
		if err := c.band.DeleteChat(ctx, run.bandChatID); err != nil {
			log.Printf("guest cleanup: delete Band chat %s: %v", run.bandChatID, err)
		}
		if c.policy.Allowed(run.repo) {
			normalized, _ := guest.NormalizeRepo(run.repo)
			parts := strings.SplitN(normalized, "/", 2)
			if len(parts) == 2 {
				if err := c.github.ClosePullRequest(ctx, parts[0], parts[1], run.prNumber); err != nil {
					log.Printf("guest cleanup: close PR for run %s: %v", run.id, err)
				}
				if err := c.github.DeleteBranch(ctx, parts[0], parts[1], "ferry-migration-"+run.id.String()); err != nil {
					log.Printf("guest cleanup: delete branch for run %s: %v", run.id, err)
				}
			}
		}
	}
	if c.rdb != nil {
		c.rdb.Del(ctx, "github_token:"+identity.userID.String(), "github_refresh_token:"+identity.userID.String())
	}
	tx, err := c.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin hard purge: %w", err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM companies WHERE id = $1`, identity.companyID); err != nil {
		return fmt.Errorf("delete guest company: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1 AND is_guest = true`, identity.userID); err != nil {
		return fmt.Errorf("delete guest user: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit hard purge: %w", err)
	}
	return nil
}

func (c *Cleaner) runResources(ctx context.Context, companyID uuid.UUID) ([]runResource, error) {
	rows, err := c.pool.Query(ctx, `
		SELECT mr.id, COALESCE(p.github_repo_url, ''), COALESCE(pr.pr_number, 0), COALESCE(br.band_room_id, '')
		FROM migration_runs mr
		JOIN projects p ON p.id = mr.project_id AND p.company_id = mr.company_id
		LEFT JOIN pull_requests pr ON pr.migration_run_id = mr.id AND pr.company_id = mr.company_id
		LEFT JOIN band_rooms br ON br.migration_run_id = mr.id AND br.company_id = mr.company_id
		WHERE mr.company_id = $1
	`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var resources []runResource
	for rows.Next() {
		var item runResource
		if err := rows.Scan(&item.id, &item.repo, &item.prNumber, &item.bandChatID); err != nil {
			return nil, err
		}
		resources = append(resources, item)
	}
	return resources, rows.Err()
}

func (c *Cleaner) artifactKeys(ctx context.Context, companyID uuid.UUID) ([]string, error) {
	rows, err := c.pool.Query(ctx, `SELECT storage_key FROM generated_artifacts WHERE company_id = $1`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

func (c *Cleaner) deleteRedis(ctx context.Context, runID uuid.UUID) {
	if c.rdb == nil {
		return
	}
	id := runID.String()
	c.rdb.Del(ctx, "ferry:files:"+id, "ferry:files:"+id+":prev", "ferry:run:active:"+id, "ferry:run:slot:"+id, "ferry:run:terminal:"+id)
	c.rdb.LRem(ctx, "ferry:run:queue", 0, id)
}
