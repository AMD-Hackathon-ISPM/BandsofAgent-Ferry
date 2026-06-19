DROP INDEX IF EXISTS idx_users_guest_created;

ALTER TABLE users DROP COLUMN is_guest;
