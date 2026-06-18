import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowRight,
  IconBrain,
  IconBrandGithub,
  IconBulb,
  IconChecklist,
  IconCircleCheck,
  IconCode,
  IconDatabase,
  IconFileCode,
  IconFileSearch,
  IconGavel,
  IconGitPullRequest,
  IconListCheck,
  IconReport,
  IconShield,
  IconSitemap,
  IconTestPipe,
  type Icon,
} from "@tabler/icons-react"

export type IconType = Icon

export type SourceLanguage = "cobol" | "java" | "php"
export type TargetLanguage = "go" | "rust"

export const SOURCE_LANGUAGE_LABEL: Record<SourceLanguage, string> = {
  cobol: "COBOL",
  java: "Java",
  php: "PHP",
}

export const TARGET_LANGUAGE_LABEL: Record<TargetLanguage, string> = {
  go: "Go",
  rust: "Rust",
}

export type AgentKey =
  | "router"
  | "source_analyzer"
  | "business_logic"
  | "code_generator"
  | "db_migration"
  | "test_generator"
  | "reviewer"
  | "commander"
  | "github_connector"

export interface AgentMeta {
  key: AgentKey
  name: string
  role: string
  color: string
  icon: IconType
}

export const AGENTS: Record<AgentKey, AgentMeta> = {
  router: {
    key: "router",
    name: "Router",
    role: "Plans the migration and delegates the work",
    color: "var(--agent-router)",
    icon: IconSitemap,
  },
  source_analyzer: {
    key: "source_analyzer",
    name: "Source Analyzer",
    role: "Maps the structure of the legacy code",
    color: "var(--agent-source)",
    icon: IconFileSearch,
  },
  business_logic: {
    key: "business_logic",
    name: "Business Logic",
    role: "Extracts the rules buried in the source",
    color: "var(--agent-logic)",
    icon: IconBrain,
  },
  code_generator: {
    key: "code_generator",
    name: "Code Generator",
    role: "Writes the target translation",
    color: "var(--agent-codegen)",
    icon: IconCode,
  },
  db_migration: {
    key: "db_migration",
    name: "DB Migration",
    role: "Plans the MyISAM to InnoDB move",
    color: "var(--agent-dbmig)",
    icon: IconDatabase,
  },
  test_generator: {
    key: "test_generator",
    name: "Test Generator",
    role: "Builds tests against the original behavior",
    color: "var(--agent-test)",
    icon: IconTestPipe,
  },
  reviewer: {
    key: "reviewer",
    name: "Reviewer",
    role: "Checks every artifact before it ships",
    color: "var(--agent-review)",
    icon: IconChecklist,
  },
  commander: {
    key: "commander",
    name: "Commander",
    role: "Makes the final call on the run",
    color: "var(--agent-commander)",
    icon: IconGavel,
  },
  github_connector: {
    key: "github_connector",
    name: "GitHub Connector",
    role: "Opens the pull request",
    color: "var(--agent-github)",
    icon: IconBrandGithub,
  },
}

export const AGENT_ORDER: AgentKey[] = [
  "router",
  "source_analyzer",
  "business_logic",
  "code_generator",
  "db_migration",
  "test_generator",
  "reviewer",
  "commander",
  "github_connector",
]

export type PhaseKey =
  | "planning"
  | "analysis"
  | "translation"
  | "db_migration"
  | "testing"
  | "review"
  | "pr_generation"

export interface PhaseMeta {
  key: PhaseKey
  label: string
  short: string
  hint: string
}

export const PHASES: PhaseMeta[] = [
  { key: "planning", label: "Planning", short: "Plan", hint: "Plan the work and delegate" },
  { key: "analysis", label: "Analysis", short: "Analyze", hint: "Read the legacy source" },
  { key: "translation", label: "Translation", short: "Translate", hint: "Write the target code" },
  { key: "db_migration", label: "DB Migration", short: "Database", hint: "Move the schema" },
  { key: "testing", label: "Testing", short: "Test", hint: "Prove behavior holds" },
  { key: "review", label: "Review", short: "Review", hint: "Check every artifact" },
  { key: "pr_generation", label: "Pull Request", short: "PR", hint: "Open the pull request" },
]

export const PHASE_INDEX: Record<PhaseKey, number> = PHASES.reduce(
  (acc, p, i) => ({ ...acc, [p.key]: i }),
  {} as Record<PhaseKey, number>,
)

export type MigrationStatus =
  | "pending"
  | "queued"
  | "planning"
  | "analyzing"
  | "translating"
  | "db_migration"
  | "testing"
  | "reviewing"
  | "generating_pr"
  | "completed"
  | "failed"
  | "blocked"
  | "needs_rework"

export type StatusTone = "idle" | "live" | "success" | "warning" | "danger"

export interface StatusMeta {
  label: string
  tone: StatusTone
  phase: PhaseKey | null
}

export const STATUS: Record<MigrationStatus, StatusMeta> = {
  pending: { label: "Pending", tone: "idle", phase: null },
  queued: { label: "Queued", tone: "idle", phase: null },
  planning: { label: "Planning", tone: "live", phase: "planning" },
  analyzing: { label: "Analyzing", tone: "live", phase: "analysis" },
  translating: { label: "Translating", tone: "live", phase: "translation" },
  db_migration: { label: "Migrating DB", tone: "live", phase: "db_migration" },
  testing: { label: "Testing", tone: "live", phase: "testing" },
  reviewing: { label: "Reviewing", tone: "live", phase: "review" },
  generating_pr: { label: "Opening PR", tone: "live", phase: "pr_generation" },
  completed: { label: "Completed", tone: "success", phase: null },
  failed: { label: "Failed", tone: "danger", phase: null },
  blocked: { label: "Blocked", tone: "warning", phase: null },
  needs_rework: { label: "Needs rework", tone: "warning", phase: "review" },
}

export function isLive(status: MigrationStatus): boolean {
  return STATUS[status].tone === "live"
}

export function isTerminal(status: MigrationStatus): boolean {
  return status === "completed" || status === "failed"
}

export type MessageType =
  | "finding"
  | "task_request"
  | "handoff"
  | "review"
  | "decision"
  | "artifact_created"
  | "blocker"

export interface MessageTypeMeta {
  label: string
  icon: IconType
  tone: "neutral" | "accent" | "signal" | "success" | "warning"
}

export const MESSAGE_TYPES: Record<MessageType, MessageTypeMeta> = {
  finding: { label: "Finding", icon: IconBulb, tone: "neutral" },
  task_request: { label: "Task", icon: IconArrowRight, tone: "neutral" },
  handoff: { label: "Handoff", icon: IconArrowRight, tone: "accent" },
  review: { label: "Review", icon: IconListCheck, tone: "neutral" },
  decision: { label: "Decision", icon: IconGavel, tone: "signal" },
  artifact_created: { label: "Artifact", icon: IconFileCode, tone: "success" },
  blocker: { label: "Blocker", icon: IconAlertTriangle, tone: "warning" },
}

export type ArtifactType =
  | "target_code"
  | "test_code"
  | "db_migration_sql"
  | "db_rollback_sql"
  | "db_validation_sql"
  | "risk_report"
  | "migration_report"
  | "pr_description"

export type ArtifactGroup = "Code" | "Database" | "Reports"

export interface ArtifactTypeMeta {
  label: string
  icon: IconType
  group: ArtifactGroup
  language: string
}

export const ARTIFACT_TYPES: Record<ArtifactType, ArtifactTypeMeta> = {
  target_code: { label: "Target code", icon: IconFileCode, group: "Code", language: "go" },
  test_code: { label: "Tests", icon: IconTestPipe, group: "Code", language: "go" },
  db_migration_sql: { label: "Migration SQL", icon: IconDatabase, group: "Database", language: "sql" },
  db_rollback_sql: { label: "Rollback SQL", icon: IconArrowBackUp, group: "Database", language: "sql" },
  db_validation_sql: { label: "Validation SQL", icon: IconCircleCheck, group: "Database", language: "sql" },
  risk_report: { label: "Risk report", icon: IconShield, group: "Reports", language: "markdown" },
  migration_report: { label: "Migration report", icon: IconReport, group: "Reports", language: "markdown" },
  pr_description: { label: "PR description", icon: IconGitPullRequest, group: "Reports", language: "markdown" },
}

export const ARTIFACT_GROUP_ORDER: ArtifactGroup[] = ["Code", "Database", "Reports"]

export type RiskLevel = "low" | "medium" | "high" | "critical"

export const RISK_TONE: Record<RiskLevel, StatusTone> = {
  low: "success",
  medium: "live",
  high: "warning",
  critical: "danger",
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  critical: "Critical risk",
}

export type Role = "owner" | "admin" | "engineer" | "reviewer"

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  engineer: "Engineer",
  reviewer: "Reviewer",
}

export function canApprove(role: Role): boolean {
  return role === "owner" || role === "admin"
}
export function canOpenPr(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "engineer"
}
export function canCancel(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "engineer"
}
