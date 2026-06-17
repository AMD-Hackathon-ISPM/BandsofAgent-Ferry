-- Per-run database-migration toggle. Previously the DB-migration choice lived
-- only on the project (set at first creation); this makes it per-run so each
-- run honors the toggle that was selected when it was launched.
ALTER TABLE migration_runs
    ADD COLUMN IF NOT EXISTS db_migration_enabled BOOLEAN NOT NULL DEFAULT false;
