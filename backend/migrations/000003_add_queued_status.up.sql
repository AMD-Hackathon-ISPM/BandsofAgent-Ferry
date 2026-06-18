-- Runs wait in the scheduler queue (Redis) for a free concurrency slot before
-- the band starts; surface that wait as a distinct status.
ALTER TYPE migration_status ADD VALUE IF NOT EXISTS 'queued';
