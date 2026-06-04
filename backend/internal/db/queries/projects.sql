-- name: CreateProject :one
INSERT INTO projects (company_id, name, description, source_language, target_language, enable_db_migration, github_repo_url, github_pat_encrypted, settings, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetProject :one
SELECT * FROM projects
WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL;

-- name: ListProjects :many
SELECT * FROM projects
WHERE company_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateProject :one
UPDATE projects
SET name = $3, description = $4, settings = $5
WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: DeleteProject :exec
UPDATE projects
SET deleted_at = NOW()
WHERE company_id = $1 AND id = $2;

-- name: CountProjects :one
SELECT COUNT(*) FROM projects
WHERE company_id = $1 AND deleted_at IS NULL;

