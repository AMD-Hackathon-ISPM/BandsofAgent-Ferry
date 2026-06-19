CREATE UNIQUE INDEX IF NOT EXISTS idx_pull_requests_run_unique ON pull_requests (company_id, migration_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_db_plans_run_unique ON db_migration_plans (company_id, migration_run_id);
