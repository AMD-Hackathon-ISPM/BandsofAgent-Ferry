-- name: CreateAgentMessage :one
INSERT INTO agent_messages (company_id, project_id, migration_run_id, band_room_id, band_message_id, agent_name, message_type, phase, summary, payload, confidence, requires_action, target_agent)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: GetAgentMessage :one
SELECT * FROM agent_messages
WHERE company_id = $1 AND id = $2;

-- name: ListAgentMessages :many
SELECT * FROM agent_messages
WHERE company_id = $1 AND migration_run_id = $2
ORDER BY created_at ASC
LIMIT $3 OFFSET $4;

-- name: ListAgentMessagesByPhase :many
SELECT * FROM agent_messages
WHERE company_id = $1 AND migration_run_id = $2 AND phase = $3
ORDER BY created_at ASC;

-- name: GetAgentTimeline :many
SELECT 
    id,
    agent_name,
    message_type,
    phase,
    summary,
    target_agent,
    confidence,
    requires_action,
    created_at
FROM agent_messages
WHERE company_id = $1 AND migration_run_id = $2
ORDER BY created_at ASC;

-- name: CountAgentMessages :one
SELECT COUNT(*) FROM agent_messages
WHERE company_id = $1 AND migration_run_id = $2;

