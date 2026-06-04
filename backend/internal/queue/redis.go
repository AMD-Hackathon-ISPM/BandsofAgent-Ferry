package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisQueue struct {
	client *redis.Client
	prefix string
}

func NewRedisQueue(addr, password string, db int, prefix string) (*RedisQueue, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &RedisQueue{
		client: client,
		prefix: prefix,
	}, nil
}

func (q *RedisQueue) Close() error {
	return q.client.Close()
}

type MigrationJob struct {
	MigrationRunID string                 `json:"migrationRunId"`
	CompanyID      string                 `json:"companyId"`
	ProjectID      string                 `json:"projectId"`
	BandRoomID     string                 `json:"bandRoomId"`
	SourceLanguage string                 `json:"sourceLanguage"`
	TargetLanguage string                 `json:"targetLanguage"`
	DBMigration    bool                   `json:"dbMigration"`
	SourceFiles    []string               `json:"sourceFiles"`
	Config         map[string]interface{} `json:"config"`
	CreatedAt      time.Time              `json:"createdAt"`
}

func (q *RedisQueue) EnqueueMigration(ctx context.Context, job *MigrationJob) error {
	data, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal job: %w", err)
	}

	queueKey := fmt.Sprintf("%s:migration:queue", q.prefix)
	if err := q.client.RPush(ctx, queueKey, data).Err(); err != nil {
		return fmt.Errorf("failed to enqueue job: %w", err)
	}

	return nil
}

func (q *RedisQueue) DequeueMigration(ctx context.Context, timeout time.Duration) (*MigrationJob, error) {
	queueKey := fmt.Sprintf("%s:migration:queue", q.prefix)

	result, err := q.client.BLPop(ctx, timeout, queueKey).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to dequeue job: %w", err)
	}

	if len(result) < 2 {
		return nil, fmt.Errorf("invalid result from BLPop")
	}

	var job MigrationJob
	if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
		return nil, fmt.Errorf("failed to unmarshal job: %w", err)
	}

	return &job, nil
}

func (q *RedisQueue) GetQueueLength(ctx context.Context) (int64, error) {
	queueKey := fmt.Sprintf("%s:migration:queue", q.prefix)
	length, err := q.client.LLen(ctx, queueKey).Result()
	if err != nil {
		return 0, fmt.Errorf("failed to get queue length: %w", err)
	}
	return length, nil
}

func (q *RedisQueue) SetRunState(ctx context.Context, runID string, state map[string]interface{}) error {
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("failed to marshal state: %w", err)
	}

	key := fmt.Sprintf("%s:run:%s:state", q.prefix, runID)
	if err := q.client.Set(ctx, key, data, 24*time.Hour).Err(); err != nil {
		return fmt.Errorf("failed to set run state: %w", err)
	}

	return nil
}

func (q *RedisQueue) GetRunState(ctx context.Context, runID string) (map[string]interface{}, error) {
	key := fmt.Sprintf("%s:run:%s:state", q.prefix, runID)

	data, err := q.client.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get run state: %w", err)
	}

	var state map[string]interface{}
	if err := json.Unmarshal([]byte(data), &state); err != nil {
		return nil, fmt.Errorf("failed to unmarshal state: %w", err)
	}

	return state, nil
}

func (q *RedisQueue) DeleteRunState(ctx context.Context, runID string) error {
	key := fmt.Sprintf("%s:run:%s:state", q.prefix, runID)
	if err := q.client.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("failed to delete run state: %w", err)
	}
	return nil
}

func (q *RedisQueue) SetCache(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal value: %w", err)
	}

	cacheKey := fmt.Sprintf("%s:cache:%s", q.prefix, key)
	if err := q.client.Set(ctx, cacheKey, data, expiration).Err(); err != nil {
		return fmt.Errorf("failed to set cache: %w", err)
	}

	return nil
}

func (q *RedisQueue) GetCache(ctx context.Context, key string, dest interface{}) error {
	cacheKey := fmt.Sprintf("%s:cache:%s", q.prefix, key)

	data, err := q.client.Get(ctx, cacheKey).Result()
	if err != nil {
		if err == redis.Nil {
			return nil
		}
		return fmt.Errorf("failed to get cache: %w", err)
	}

	if err := json.Unmarshal([]byte(data), dest); err != nil {
		return fmt.Errorf("failed to unmarshal cache: %w", err)
	}

	return nil
}

func (q *RedisQueue) DeleteCache(ctx context.Context, key string) error {
	cacheKey := fmt.Sprintf("%s:cache:%s", q.prefix, key)
	if err := q.client.Del(ctx, cacheKey).Err(); err != nil {
		return fmt.Errorf("failed to delete cache: %w", err)
	}
	return nil
}

func (q *RedisQueue) AcquireLock(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	lockKey := fmt.Sprintf("%s:lock:%s", q.prefix, key)

	success, err := q.client.SetNX(ctx, lockKey, "1", ttl).Result()
	if err != nil {
		return false, fmt.Errorf("failed to acquire lock: %w", err)
	}

	return success, nil
}

func (q *RedisQueue) ReleaseLock(ctx context.Context, key string) error {
	lockKey := fmt.Sprintf("%s:lock:%s", q.prefix, key)
	if err := q.client.Del(ctx, lockKey).Err(); err != nil {
		return fmt.Errorf("failed to release lock: %w", err)
	}
	return nil
}
