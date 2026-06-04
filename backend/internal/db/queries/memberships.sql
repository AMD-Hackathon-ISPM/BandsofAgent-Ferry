-- name: CreateMembership :one
INSERT INTO memberships (company_id, user_id, role, invited_by, invited_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetMembership :one
SELECT * FROM memberships
WHERE company_id = $1 AND user_id = $2;

-- name: GetUserMemberships :many
SELECT m.*, c.name as company_name, c.slug as company_slug
FROM memberships m
JOIN companies c ON c.id = m.company_id
WHERE m.user_id = $1 AND c.deleted_at IS NULL
ORDER BY m.created_at DESC;

-- name: GetCompanyMembers :many
SELECT m.*, u.email, u.full_name, u.avatar_url
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.company_id = $1 AND u.deleted_at IS NULL
ORDER BY m.created_at ASC;

-- name: UpdateMembershipRole :one
UPDATE memberships
SET role = $3
WHERE company_id = $1 AND user_id = $2
RETURNING *;

-- name: AcceptInvitation :one
UPDATE memberships
SET accepted_at = NOW()
WHERE company_id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteMembership :exec
DELETE FROM memberships
WHERE company_id = $1 AND user_id = $2;

-- name: CountCompanyMembers :one
SELECT COUNT(*) FROM memberships
WHERE company_id = $1;

