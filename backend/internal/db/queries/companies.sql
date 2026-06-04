-- name: CreateCompany :one
INSERT INTO companies (name, slug, subscription_tier, max_projects, max_users, settings)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetCompanyByID :one
SELECT * FROM companies
WHERE id = $1 AND deleted_at IS NULL;

-- name: GetCompanyBySlug :one
SELECT * FROM companies
WHERE slug = $1 AND deleted_at IS NULL;

-- name: UpdateCompany :one
UPDATE companies
SET name = $2, settings = $3
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: DeleteCompany :exec
UPDATE companies
SET deleted_at = NOW()
WHERE id = $1;

-- name: ListCompanies :many
SELECT * FROM companies
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

