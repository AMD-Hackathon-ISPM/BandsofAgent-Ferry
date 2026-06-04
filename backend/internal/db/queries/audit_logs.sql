-- name: CreateAuditLog :one
INSERT INTO audit_logs (company_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListAuditLogs :many
SELECT * FROM audit_logs
WHERE company_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListAuditLogsByUser :many
SELECT * FROM audit_logs
WHERE company_id = $1 AND user_id = $2
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;

-- name: ListAuditLogsByAction :many
SELECT * FROM audit_logs
WHERE company_id = $1 AND action = $2
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;

-- name: ListAuditLogsByResource :many
SELECT * FROM audit_logs
WHERE company_id = $1 AND resource_type = $2 AND resource_id = $3
ORDER BY created_at DESC;

