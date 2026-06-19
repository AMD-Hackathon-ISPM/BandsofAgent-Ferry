package guest

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

var (
	ErrRateLimited = errors.New("guest rate limit exceeded")
	ErrSessionCap  = errors.New("guest active run limit exceeded")
	ErrGlobalCap   = errors.New("guest global run limit exceeded")
)

type Admission struct {
	pool           *pgxpool.Pool
	rdb            *redis.Client
	window         time.Duration
	creationLimit  int
	runLimit       int
	activeRunLimit int
	globalRunLimit int
	mu             sync.Mutex
}

func NewAdmission(pool *pgxpool.Pool, rdb *redis.Client, window time.Duration, creationLimit, runLimit, activeRunLimit, globalRunLimit int) *Admission {
	return &Admission{
		pool: pool, rdb: rdb, window: window, creationLimit: creationLimit,
		runLimit: runLimit, activeRunLimit: activeRunLimit, globalRunLimit: globalRunLimit,
	}
}

func ClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	remote := net.ParseIP(host)
	if remote != nil && (remote.IsLoopback() || remote.IsPrivate()) {
		if forwarded := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); forwarded != nil {
			return forwarded.String()
		}
	}
	if remote != nil {
		return remote.String()
	}
	return host
}

func (a *Admission) AllowGuestCreation(ctx context.Context, ip string) error {
	return a.allow(ctx, "guest:create:"+hashIP(ip), a.creationLimit)
}

func (a *Admission) AdmitRun(ctx context.Context, companyID, ip string) (func(), error) {
	a.mu.Lock()
	release := func() { a.mu.Unlock() }
	if err := a.allow(ctx, "guest:run:create:"+hashIP(ip), a.runLimit); err != nil {
		a.mu.Unlock()
		return nil, err
	}

	const statuses = `('pending','queued','planning','analyzing','translating','db_migration','testing','reviewing','generating_pr','needs_rework')`
	var sessionCount int
	if err := a.pool.QueryRow(ctx, `SELECT COUNT(*) FROM migration_runs WHERE company_id = $1 AND status IN `+statuses, companyID).Scan(&sessionCount); err != nil {
		a.mu.Unlock()
		return nil, fmt.Errorf("count guest session runs: %w", err)
	}
	if sessionCount >= a.activeRunLimit {
		a.mu.Unlock()
		return nil, ErrSessionCap
	}

	var globalCount int
	if err := a.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM migration_runs mr
		JOIN users u ON u.id = mr.created_by
		WHERE u.is_guest = true AND mr.status IN `+statuses).Scan(&globalCount); err != nil {
		a.mu.Unlock()
		return nil, fmt.Errorf("count global guest runs: %w", err)
	}
	if globalCount >= a.globalRunLimit {
		a.mu.Unlock()
		return nil, ErrGlobalCap
	}
	return release, nil
}

func (a *Admission) allow(ctx context.Context, key string, limit int) error {
	if a == nil || a.rdb == nil || limit <= 0 || a.window <= 0 {
		return fmt.Errorf("guest admission is unavailable")
	}
	result, err := a.rdb.Eval(ctx, `
		local count = redis.call('INCR', KEYS[1])
		if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
		return count
	`, []string{key}, strconv.FormatInt(max(1, int64(a.window/time.Second)), 10)).Int64()
	if err != nil {
		return fmt.Errorf("guest admission counter: %w", err)
	}
	if result > int64(limit) {
		return ErrRateLimited
	}
	return nil
}

func hashIP(ip string) string {
	sum := sha256.Sum256([]byte(ip))
	return fmt.Sprintf("%x", sum[:12])
}
