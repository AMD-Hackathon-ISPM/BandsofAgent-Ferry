ALTER TABLE users ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_users_guest_created ON users(created_at) WHERE is_guest = TRUE;
