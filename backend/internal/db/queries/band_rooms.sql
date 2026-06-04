-- name: CreateBandRoom :one
INSERT INTO band_rooms (company_id, migration_run_id, band_room_id, room_name, room_description, room_metadata)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetBandRoom :one
SELECT * FROM band_rooms
WHERE company_id = $1 AND id = $2;

-- name: GetBandRoomByRunID :one
SELECT * FROM band_rooms
WHERE company_id = $1 AND migration_run_id = $2;

-- name: GetBandRoomByBandID :one
SELECT * FROM band_rooms
WHERE band_room_id = $1;

-- name: UpdateBandRoomMetadata :one
UPDATE band_rooms
SET room_metadata = $3
WHERE company_id = $1 AND id = $2
RETURNING *;

