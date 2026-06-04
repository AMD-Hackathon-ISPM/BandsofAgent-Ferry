-- name: CreateMigrationRun :one
INSERT INTO migration_runs (company_id, project_id, run_number, status, band_room_id, source_commit_sha, target_branch, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetMigrationRun :one
SELECT * FROM migration_runs
WHERE company_id = $1 AND id = $2;

-- name: ListMigrationRuns :many
SELECT * FROM migration_runs
WHERE company_id = $1 AND project_id = $2
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;

-- name: UpdateMigrationRunStatus :one
UPDATE migration_runs
SET status = $3, error_message = $4
WHERE company_id = $1 AND id = $2
RETURNING *;

-- name: StartMigrationRun :one
UPDATE migration_runs
SET status = $3, started_at = NOW()
WHERE company_id = $1 AND id = $2
RETURNING *;

-- name: CompleteMigrationRun :one
UPDATE migration_runs
SET status = $3, completed_at = NOW()
WHERE company_id = $1 AND id = $2
RETURNING *;

-- name: GetNextRunNumber :one
SELECT COALESCE(MAX(run_number), 0) + 1 as next_number
FROM migration_runs
WHERE company_id = $1 AND project_id = $2;

-- name: CountMigrationRuns :one
SELECT COUNT(*) FROM migration_runs
WHERE company_id = $1 AND project_id = $2;

