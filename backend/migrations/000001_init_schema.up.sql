CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    max_projects INTEGER DEFAULT 5,
    max_users INTEGER DEFAULT 10,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_companies_slug ON companies(slug) WHERE deleted_at IS NULL;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    email_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'engineer', 'reviewer');

CREATE TABLE memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role membership_role NOT NULL DEFAULT 'engineer',
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, user_id)
);

CREATE INDEX idx_memberships_company ON memberships(company_id);
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_role ON memberships(company_id, role);

CREATE TYPE source_language AS ENUM ('cobol', 'java', 'php');
CREATE TYPE target_language AS ENUM ('go', 'rust');

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_language source_language NOT NULL,
    target_language target_language NOT NULL,
    enable_db_migration BOOLEAN DEFAULT FALSE,
    github_repo_url VARCHAR(500),
    github_pat_encrypted TEXT,
    settings JSONB DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_projects_company ON projects(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_company_id ON projects(company_id, id) WHERE deleted_at IS NULL;

CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    github_owner VARCHAR(255) NOT NULL,
    github_repo VARCHAR(255) NOT NULL,
    default_branch VARCHAR(100) DEFAULT 'main',
    pat_encrypted TEXT,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, project_id)
);

CREATE INDEX idx_repositories_company ON repositories(company_id);
CREATE INDEX idx_repositories_project ON repositories(company_id, project_id);

CREATE TYPE migration_status AS ENUM (
    'pending',
    'planning',
    'analyzing',
    'translating',
    'db_migration',
    'testing',
    'reviewing',
    'generating_pr',
    'completed',
    'failed',
    'blocked',
    'needs_rework'
);

CREATE TABLE migration_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_number INTEGER NOT NULL,
    status migration_status DEFAULT 'pending',
    band_room_id VARCHAR(255),
    source_commit_sha VARCHAR(40),
    target_branch VARCHAR(255),
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, project_id, run_number)
);

CREATE INDEX idx_migration_runs_company ON migration_runs(company_id);
CREATE INDEX idx_migration_runs_project ON migration_runs(company_id, project_id);
CREATE INDEX idx_migration_runs_status ON migration_runs(company_id, status);
CREATE INDEX idx_migration_runs_band_room ON migration_runs(band_room_id);

CREATE TABLE source_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    migration_run_id UUID REFERENCES migration_runs(id) ON DELETE CASCADE,
    file_path VARCHAR(1000) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    storage_key VARCHAR(500) NOT NULL,
    checksum VARCHAR(64),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_source_files_company ON source_files(company_id);
CREATE INDEX idx_source_files_project ON source_files(company_id, project_id);
CREATE INDEX idx_source_files_run ON source_files(company_id, migration_run_id);

CREATE TYPE artifact_type AS ENUM (
    'target_code',
    'test_code',
    'db_migration_sql',
    'db_rollback_sql',
    'db_validation_sql',
    'risk_report',
    'migration_report',
    'pr_description'
);

CREATE TABLE generated_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    migration_run_id UUID NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
    artifact_type artifact_type NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    checksum VARCHAR(64),
    metadata JSONB DEFAULT '{}',
    generated_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_artifacts_company ON generated_artifacts(company_id);
CREATE INDEX idx_artifacts_run ON generated_artifacts(company_id, migration_run_id);
CREATE INDEX idx_artifacts_type ON generated_artifacts(company_id, artifact_type);

CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'blocked');

CREATE TABLE agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    migration_run_id UUID NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
    agent_name VARCHAR(100) NOT NULL,
    task_type VARCHAR(100) NOT NULL,
    status task_status DEFAULT 'pending',
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agent_tasks_company ON agent_tasks(company_id);
CREATE INDEX idx_agent_tasks_run ON agent_tasks(company_id, migration_run_id);
CREATE INDEX idx_agent_tasks_agent ON agent_tasks(company_id, agent_name);
CREATE INDEX idx_agent_tasks_status ON agent_tasks(company_id, status);

CREATE TYPE message_type AS ENUM (
    'finding',
    'task_request',
    'handoff',
    'review',
    'decision',
    'artifact_created',
    'blocker'
);

CREATE TYPE migration_phase AS ENUM (
    'planning',
    'analysis',
    'translation',
    'db_migration',
    'testing',
    'review',
    'pr_generation',
    'completed'
);

CREATE TABLE agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    migration_run_id UUID NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
    band_room_id VARCHAR(255) NOT NULL,
    band_message_id VARCHAR(255),
    agent_name VARCHAR(100) NOT NULL,
    message_type message_type NOT NULL,
    phase migration_phase NOT NULL,
    summary TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    confidence DECIMAL(3,2),
    requires_action BOOLEAN DEFAULT FALSE,
    target_agent VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agent_messages_company ON agent_messages(company_id);
CREATE INDEX idx_agent_messages_run ON agent_messages(company_id, migration_run_id);
CREATE INDEX idx_agent_messages_room ON agent_messages(band_room_id);
CREATE INDEX idx_agent_messages_agent ON agent_messages(company_id, agent_name);
CREATE INDEX idx_agent_messages_phase ON agent_messages(company_id, phase);
CREATE INDEX idx_agent_messages_created ON agent_messages(migration_run_id, created_at);

CREATE TABLE band_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    migration_run_id UUID NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
    band_room_id VARCHAR(255) UNIQUE NOT NULL,
    room_name VARCHAR(255) NOT NULL,
    room_description TEXT,
    room_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_band_rooms_company ON band_rooms(company_id);
CREATE INDEX idx_band_rooms_run ON band_rooms(company_id, migration_run_id);
CREATE INDEX idx_band_rooms_band_id ON band_rooms(band_room_id);

CREATE TABLE band_agent_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    band_room_id VARCHAR(255) NOT NULL,
    agent_name VARCHAR(100) NOT NULL,
    agent_role VARCHAR(100),
    capabilities JSONB DEFAULT '[]',
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(band_room_id, agent_name)
);

CREATE INDEX idx_band_registrations_company ON band_agent_registrations(company_id);
CREATE INDEX idx_band_registrations_room ON band_agent_registrations(band_room_id);

CREATE TABLE band_context_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    migration_run_id UUID NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
    band_room_id VARCHAR(255) NOT NULL,
    snapshot_data JSONB NOT NULL,
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_context_snapshots_company ON band_context_snapshots(company_id);
CREATE INDEX idx_context_snapshots_run ON band_context_snapshots(company_id, migration_run_id);
CREATE INDEX idx_context_snapshots_room ON band_context_snapshots(band_room_id);

CREATE TYPE pr_status AS ENUM ('open', 'merged', 'closed', 'draft');

CREATE TABLE pull_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    migration_run_id UUID NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
    pr_number INTEGER NOT NULL,
    pr_url VARCHAR(500) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    source_branch VARCHAR(255) NOT NULL,
    target_branch VARCHAR(255) NOT NULL,
    status pr_status DEFAULT 'open',
    merged_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pull_requests_company ON pull_requests(company_id);
CREATE INDEX idx_pull_requests_project ON pull_requests(company_id, project_id);
CREATE INDEX idx_pull_requests_run ON pull_requests(company_id, migration_run_id);

CREATE TYPE db_migration_risk_level AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE db_migration_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    migration_run_id UUID NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
    source_schema TEXT NOT NULL,
    target_schema TEXT NOT NULL,
    migration_sql TEXT NOT NULL,
    rollback_sql TEXT NOT NULL,
    validation_sql TEXT,
    risk_level db_migration_risk_level DEFAULT 'medium',
    risk_factors JSONB DEFAULT '[]',
    estimated_duration_seconds INTEGER,
    requires_downtime BOOLEAN DEFAULT FALSE,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_db_plans_company ON db_migration_plans(company_id);
CREATE INDEX idx_db_plans_project ON db_migration_plans(company_id, project_id);
CREATE INDEX idx_db_plans_run ON db_migration_plans(company_id, migration_run_id);

CREATE TYPE audit_action AS ENUM (
    'user_login',
    'user_logout',
    'user_invited',
    'project_created',
    'file_uploaded',
    'migration_run_created',
    'band_room_created',
    'agent_message_created',
    'pr_created',
    'artifact_downloaded',
    'settings_changed',
    'user_role_changed'
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action audit_action NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_company ON audit_logs(company_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

CREATE TYPE model_provider AS ENUM ('ibm', 'openai', 'anthropic', 'gemini', 'deepseek');

CREATE TABLE model_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    provider model_provider NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    api_endpoint VARCHAR(500),
    api_key_encrypted TEXT,
    default_temperature DECIMAL(3,2) DEFAULT 0.7,
    default_max_tokens INTEGER DEFAULT 4096,
    is_default BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_model_configs_company ON model_configs(company_id);
CREATE INDEX idx_model_configs_provider ON model_configs(company_id, provider);
CREATE INDEX idx_model_configs_default ON model_configs(company_id, is_default);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_repositories_updated_at BEFORE UPDATE ON repositories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_migration_runs_updated_at BEFORE UPDATE ON migration_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_source_files_updated_at BEFORE UPDATE ON source_files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_generated_artifacts_updated_at BEFORE UPDATE ON generated_artifacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_tasks_updated_at BEFORE UPDATE ON agent_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_messages_updated_at BEFORE UPDATE ON agent_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_band_rooms_updated_at BEFORE UPDATE ON band_rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_band_agent_registrations_updated_at BEFORE UPDATE ON band_agent_registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pull_requests_updated_at BEFORE UPDATE ON pull_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_db_migration_plans_updated_at BEFORE UPDATE ON db_migration_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_model_configs_updated_at BEFORE UPDATE ON model_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

