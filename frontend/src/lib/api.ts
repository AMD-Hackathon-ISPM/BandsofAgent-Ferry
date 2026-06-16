import type { RecentRunSummary, Run } from "@/lib/types"
import { USE_DUMMY_DATA } from "@/lib/dev-mode"
import { RECENT_RUNS, getRun } from "@/lib/mock/data"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080"

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

function getStoredToken(): string {
  try {
    const raw = localStorage.getItem("ferry.session")
    if (!raw) return ""
    return JSON.parse(raw).accessToken ?? ""
  } catch {
    return ""
  }
}

export async function fetchRecentRuns(): Promise<RecentRunSummary[]> {
  if (USE_DUMMY_DATA) return RECENT_RUNS

  const token = getStoredToken()
  if (!token) return []
  try {
    const resp = await fetch(`${API_URL}/api/runs`, {
      headers: authHeaders(token),
    })
    if (!resp.ok) return []
    return (await resp.json()) as RecentRunSummary[]
  } catch {
    return []
  }
}

export async function fetchRun(id: string): Promise<Run> {
  if (USE_DUMMY_DATA) {
    const run = getRun(id)
    if (!run) throw new Error(`Run ${id} was not found.`)
    return run
  }

  const token = getStoredToken()
  const resp = await fetch(`${API_URL}/api/runs/${id}`, {
    headers: token ? authHeaders(token) : {},
  })
  if (resp.status === 404) throw new Error(`Run ${id} was not found.`)
  if (!resp.ok) throw new Error(`Failed to fetch run ${id}.`)
  return (await resp.json()) as Run
}

export interface CreateRunResult {
  id: string
  runNumber: number
}

export async function createRun(
  accessToken: string,
  repo: string,
  branch: string,
  sourceLanguage: string,
  targetLanguage: string,
  dbEnabled: boolean,
): Promise<CreateRunResult> {
  if (USE_DUMMY_DATA) return { id: "run_7", runNumber: 7 }

  const resp = await fetch(`${API_URL}/api/runs`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repo, branch, sourceLanguage, targetLanguage, dbEnabled }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? "Failed to create run")
  }
  return (await resp.json()) as CreateRunResult
}

export async function startRun(accessToken: string, runId: string): Promise<void> {
  if (USE_DUMMY_DATA) return

  const resp = await fetch(`${API_URL}/api/runs/${runId}/start`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
  if (!resp.ok) throw new Error("Failed to start run")
}

export async function cancelRun(accessToken: string, runId: string): Promise<void> {
  if (USE_DUMMY_DATA) return

  const resp = await fetch(`${API_URL}/api/runs/${runId}/cancel`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
  if (!resp.ok) throw new Error("Failed to cancel run")
}

export async function rerunRun(
  accessToken: string,
  runId: string,
): Promise<CreateRunResult> {
  if (USE_DUMMY_DATA) return { id: "run_7", runNumber: 7 }

  const resp = await fetch(`${API_URL}/api/runs/${runId}/rerun`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
  if (!resp.ok) throw new Error("Failed to rerun")
  return (await resp.json()) as CreateRunResult
}

export async function approveDbPlan(accessToken: string, runId: string): Promise<void> {
  if (USE_DUMMY_DATA) return

  const resp = await fetch(`${API_URL}/api/runs/${runId}/db-plan/approve`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
  if (!resp.ok) throw new Error("Failed to approve DB plan")
}

export interface ResolvedRepo {
  owner: string
  name: string
  defaultBranch: string
  branches: string[]
  detectedLanguage: "cobol" | "java" | "php" | "unsupported"
  detectedLabel: string
  risk: MigrationRisk
  languages?: Record<string, number>
}

export type RepoResolution =
  | { ok: true; repo: ResolvedRepo }
  | { ok: false; reason: "format" | "access" }

export interface MigrationRisk {
  percentage: number
  level: "high" | "medium" | "low" | "blocked"
  label: string
  selectable: boolean
}

export interface RepoSuggestion {
  fullName: string
  detectedLanguage: ResolvedRepo["detectedLanguage"]
  detectedLabel: string
  risk: MigrationRisk
}

const DUMMY_REPOS: Record<string, ResolvedRepo> = {
  "northwind/payroll-cobol": {
    owner: "northwind",
    name: "payroll-cobol",
    defaultBranch: "main",
    branches: ["main", "release/2026-q2", "legacy/payroll"],
    detectedLanguage: "cobol",
    detectedLabel: "COBOL",
    risk: {
      percentage: 91,
      level: "high",
      label: "Strong migration candidate",
      selectable: true,
    },
    languages: { COBOL: 91, JCL: 6, Shell: 3 },
  },
  "northwind/ledger-java": {
    owner: "northwind",
    name: "ledger-java",
    defaultBranch: "main",
    branches: ["main", "staging", "ferry/ledger-go"],
    detectedLanguage: "java",
    detectedLabel: "Java",
    risk: {
      percentage: 74,
      level: "medium",
      label: "Good migration candidate",
      selectable: true,
    },
    languages: { Java: 74, SQL: 18, Shell: 8 },
  },
  "northwind/claims-php": {
    owner: "northwind",
    name: "claims-php",
    defaultBranch: "main",
    branches: ["main", "release/claims-v3", "hotfix/intake"],
    detectedLanguage: "php",
    detectedLabel: "PHP",
    risk: {
      percentage: 68,
      level: "medium",
      label: "Good migration candidate",
      selectable: true,
    },
    languages: { PHP: 68, SQL: 21, JavaScript: 11 },
  },
}

const DUMMY_REPO_SUGGESTIONS: RepoSuggestion[] = Object.entries(DUMMY_REPOS).map(
  ([fullName, repo]) => ({
    fullName,
    detectedLanguage: repo.detectedLanguage,
    detectedLabel: repo.detectedLabel,
    risk: repo.risk,
  }),
)

function parseRepoInput(input: string): string | null {
  const match = input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "")
  const parts = match.split("/")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return `${parts[0]}/${parts[1]}`
}

export async function resolveRepo(
  input: string,
  accessToken: string,
): Promise<RepoResolution> {
  const key = parseRepoInput(input)
  if (!key) return { ok: false, reason: "format" }

  if (USE_DUMMY_DATA) {
    const repo = Object.entries(DUMMY_REPOS).find(
      ([fullName]) => fullName.toLowerCase() === key.toLowerCase(),
    )?.[1]
    return repo ? { ok: true, repo } : { ok: false, reason: "access" }
  }

  try {
    const resp = await fetch(
      `${API_URL}/api/github/repos/resolve?repo=${encodeURIComponent(key)}`,
      {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    if (resp.status === 404) return { ok: false, reason: "access" }
    if (!resp.ok) return { ok: false, reason: "access" }
    const repo = (await resp.json()) as ResolvedRepo
    return { ok: true, repo }
  } catch {
    return { ok: false, reason: "access" }
  }
}

export async function fetchRepoSuggestions(
  accessToken: string,
): Promise<RepoSuggestion[]> {
  if (USE_DUMMY_DATA) return DUMMY_REPO_SUGGESTIONS

  try {
    const resp = await fetch(`${API_URL}/api/github/repos/suggestions`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) throw new Error(`repo suggestions failed: ${resp.status}`)
    const suggestions = (await resp.json()) as Array<string | RepoSuggestion>
    return suggestions.map((suggestion) =>
      typeof suggestion === "string"
        ? {
            fullName: suggestion,
            detectedLanguage: "unsupported",
            detectedLabel: "Unknown",
            risk: {
              percentage: 0,
              level: "blocked",
              label: "Calculating risk",
              selectable: true,
            },
          }
        : suggestion,
    )
  } catch {
    return []
  }
}

export interface AppInstallation {
  installed: boolean
  installUrl: string
}

/**
 * Reports whether the Ferry GitHub App is installed on a repo (so it can push),
 * and where to install it. Returns installed=true when the App isn't configured
 * server-side, so the launch flow isn't blocked in that case.
 */
export async function fetchAppInstallation(
  accessToken: string,
  repo: string,
): Promise<AppInstallation> {
  if (USE_DUMMY_DATA) return { installed: true, installUrl: "" }

  try {
    const resp = await fetch(
      `${API_URL}/api/github/app/installation?repo=${encodeURIComponent(repo)}`,
      {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    if (!resp.ok) return { installed: true, installUrl: "" }
    return (await resp.json()) as AppInstallation
  } catch {
    // On a check failure, don't block launch — the PR step still has fallbacks.
    return { installed: true, installUrl: "" }
  }
}

export { API_URL }
