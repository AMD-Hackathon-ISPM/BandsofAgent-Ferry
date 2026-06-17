import type {
  AgentKey,
  ArtifactType,
  MessageType,
  MigrationStatus,
  PhaseKey,
  RiskLevel,
  Role,
  SourceLanguage,
  TargetLanguage,
} from "@/lib/domain"

export interface User {
  id: string
  name: string
  handle: string
  email: string
  role: Role
  avatarUrl?: string
}

export interface Project {
  id: string
  name: string
  repoUrl: string
  repoOwner: string
  repoName: string
  sourceLanguage: SourceLanguage
  targetLanguage: TargetLanguage
  dbEnabled: boolean
}

export type AgentRunStatus = "idle" | "waiting" | "active" | "blocked" | "done"

export interface AgentRuntime {
  key: AgentKey
  status: AgentRunStatus
  currentTask?: string
  lastActionAt?: string
}

export interface AgentMessageVM {
  id: string
  agent: AgentKey
  type: MessageType
  phase: PhaseKey
  summary: string
  payload?: Record<string, unknown>
  requiresAction?: boolean
  targetAgent?: AgentKey
  createdAt: string
}

export interface Artifact {
  id: string
  type: ArtifactType
  fileName: string
  sizeBytes: number
  createdBy: AgentKey
  /** Short snippet shown before full content loads. */
  preview?: string
  /** Full file body. Falls back to `preview` until the backend serves it. */
  content?: string
}

export interface DbPlan {
  id: string
  riskLevel: RiskLevel
  requiresDowntime: boolean
  estimatedSeconds: number
  riskFactors: string[]
  approvedBy?: string
  approvedAt?: string
  migrationSqlPreview: string
}

export type PrStatus = "open" | "merged" | "closed" | "draft"

export interface PullRequest {
  number: number
  url: string
  title: string
  status: PrStatus
  sourceBranch: string
  targetBranch: string
}

export interface Run {
  id: string
  runNumber: number
  project: Project
  status: MigrationStatus
  currentPhase: PhaseKey | null
  bandRoomName: string
  sourceCommit: string
  targetBranch: string
  startedAt?: string
  completedAt?: string
  errorMessage?: string
  dbEnabled?: boolean
  agents: AgentRuntime[]
  messages: AgentMessageVM[]
  artifacts: Artifact[]
  dbPlan?: DbPlan | null
  pr?: PullRequest | null
}

export interface RecentRunSummary {
  id: string
  runNumber: number
  projectName: string
  sourceLanguage: SourceLanguage
  targetLanguage: TargetLanguage
  status: MigrationStatus
  updatedAt: string
  messageCount: number
}
