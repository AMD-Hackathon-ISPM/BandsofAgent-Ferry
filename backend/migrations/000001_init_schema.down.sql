DROP TRIGGER IF EXISTS update_model_configs_updated_at ON model_configs;
DROP TRIGGER IF EXISTS update_db_migration_plans_updated_at ON db_migration_plans;
DROP TRIGGER IF EXISTS update_pull_requests_updated_at ON pull_requests;
DROP TRIGGER IF EXISTS update_band_agent_registrations_updated_at ON band_agent_registrations;
DROP TRIGGER IF EXISTS update_band_rooms_updated_at ON band_rooms;
DROP TRIGGER IF EXISTS update_agent_messages_updated_at ON agent_messages;
DROP TRIGGER IF EXISTS update_agent_tasks_updated_at ON agent_tasks;
DROP TRIGGER IF EXISTS update_generated_artifacts_updated_at ON generated_artifacts;
DROP TRIGGER IF EXISTS update_source_files_updated_at ON source_files;
DROP TRIGGER IF EXISTS update_migration_runs_updated_at ON migration_runs;
DROP TRIGGER IF EXISTS update_repositories_updated_at ON repositories;
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
DROP TRIGGER IF EXISTS update_memberships_updated_at ON memberships;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;

DROP FUNCTION IF EXISTS update_updated_at_column();

DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS model_configs;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS db_migration_plans;
DROP TABLE IF EXISTS pull_requests;
DROP TABLE IF EXISTS band_context_snapshots;
DROP TABLE IF EXISTS band_agent_registrations;
DROP TABLE IF EXISTS band_rooms;
DROP TABLE IF EXISTS agent_messages;
DROP TABLE IF EXISTS agent_tasks;
DROP TABLE IF EXISTS generated_artifacts;
DROP TABLE IF EXISTS source_files;
DROP TABLE IF EXISTS migration_runs;
DROP TABLE IF EXISTS repositories;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS companies;

DROP TYPE IF EXISTS model_provider;
DROP TYPE IF EXISTS audit_action;
DROP TYPE IF EXISTS db_migration_risk_level;
DROP TYPE IF EXISTS pr_status;
DROP TYPE IF EXISTS migration_phase;
DROP TYPE IF EXISTS message_type;
DROP TYPE IF EXISTS task_status;
DROP TYPE IF EXISTS artifact_type;
DROP TYPE IF EXISTS migration_status;
DROP TYPE IF EXISTS target_language;
DROP TYPE IF EXISTS source_language;
DROP TYPE IF EXISTS membership_role;

DROP EXTENSION IF EXISTS "uuid-ossp";

