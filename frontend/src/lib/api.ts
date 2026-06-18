import type { RecentRunSummary, Run } from "@/lib/types"
import { USE_DUMMY_DATA } from "@/lib/dev-mode"
import { isLive } from "@/lib/domain"
import { RECENT_RUNS, getRun } from "@/lib/mock/data"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080"
const SESSION_KEY = "ferry.session"
const dummyArtifactPreviewed = new Set<string>()
const dummyStartedRuns = new Set<string>()

interface StoredSession {
  accessToken?: string
  refreshToken?: string
  [k: string]: unknown
}

function getSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

function getStoredToken(): string {
  return getSession()?.accessToken ?? ""
}

// endSession clears the stored session and signals the app to route to login.
// Called only on UNRECOVERABLE auth failures (no refresh token, or the refresh
// token itself is rejected) — never on transient/network errors, so a blip
// doesn't log the user out.
function endSession() {
  localStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event("ferry:session-expired"))
}

// Single in-flight refresh shared across concurrent 401s — the backend rotates
// the refresh token, so parallel refreshes would invalidate each other.
let refreshInFlight: Promise<string | null> | null = null

async function refreshSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      const session = getSession()
      if (!session?.refreshToken) {
        // No way to recover — end the session so the app routes to login
        // instead of silently failing every call and showing empty data.
        endSession()
        return null
      }
      const resp = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      })
      if (!resp.ok) {
        if (resp.status === 401) endSession() // refresh token dead
        return null // 5xx/transient → keep the session, let the caller retry later
      }
      const data = (await resp.json()) as {
        accessToken: string
        refreshToken: string
      }
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          ...getSession(),
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        })
      )
      return data.accessToken
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

// tokenExpired decodes the JWT exp claim (with a 30s skew) without a network
// call, so callers can refresh proactively before using a token.
function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as { exp?: number }
    if (!payload.exp) return false
    return Date.now() >= payload.exp * 1000 - 30_000
  } catch {
    return true
  }
}

/**
 * Returns a currently-valid access token, refreshing first if the stored one is
 * expired. Used where we can't rely on a 401 round-trip to trigger refresh —
 * notably the SSE stream URL, which carries the token as a query param.
 */
export async function ensureFreshToken(): Promise<string> {
  const token = getStoredToken()
  if (token && !tokenExpired(token)) return token
  const fresh = await refreshSession()
  return fresh ?? token
}

/**
 * fetch wrapper for authenticated API calls: attaches the current access token
 * and, on a 401, transparently refreshes it once and retries. This is what
 * prevents the "can't reach repository" error after the 15-minute access token
 * expires while idling on a screen.
 */
async function authedFetch(
  path: string,
  init: RequestInit = {},
  fallbackToken?: string
): Promise<Response> {
  const doFetch = (t: string) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
    })
  let resp = await doFetch(getStoredToken() || fallbackToken || "")
  if (resp.status === 401) {
    const fresh = await refreshSession()
    if (fresh) resp = await doFetch(fresh)
  }
  return resp
}

export async function fetchRecentRuns(): Promise<RecentRunSummary[]> {
  if (USE_DUMMY_DATA) return RECENT_RUNS
  try {
    const resp = await authedFetch(`/api/runs`)
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
    if (id === "run_8" && dummyStartedRuns.has(id)) {
      return {
        ...run,
        status: "planning",
        currentPhase: "planning",
        startedAt: new Date().toISOString(),
        agents: run.agents.map((agent) =>
          agent.key === "router"
            ? {
                ...agent,
                status: "active",
                currentTask: "Planning migration route",
                lastActionAt: new Date().toISOString(),
              }
            : agent
        ),
        messages: [
          {
            id: "r8m1",
            agent: "router",
            type: "task_request",
            phase: "planning",
            summary: "Migration run dispatched. Building the plan.",
            createdAt: new Date().toISOString(),
          },
        ],
      }
    }
    if (
      isLive(run.status) &&
      run.artifacts.length > 0 &&
      !dummyArtifactPreviewed.has(id)
    ) {
      dummyArtifactPreviewed.add(id)
      return { ...run, artifacts: run.artifacts.slice(0, -1) }
    }
    return run
  }

  const resp = await authedFetch(`/api/runs/${id}`)
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
  dbEnabled: boolean
): Promise<CreateRunResult> {
  if (USE_DUMMY_DATA) {
    dummyStartedRuns.delete("run_8")
    return { id: "run_8", runNumber: 8 }
  }

  const resp = await authedFetch(
    `/api/runs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo,
        branch,
        sourceLanguage,
        targetLanguage,
        dbEnabled,
      }),
    },
    accessToken
  )
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? "Failed to create run")
  }
  return (await resp.json()) as CreateRunResult
}

export async function startRun(
  accessToken: string,
  runId: string
): Promise<void> {
  if (USE_DUMMY_DATA) {
    await new Promise((resolve) => setTimeout(resolve, 700))
    dummyStartedRuns.add(runId)
    return
  }

  const resp = await authedFetch(
    `/api/runs/${runId}/start`,
    { method: "POST" },
    accessToken
  )
  if (!resp.ok) throw new Error("Failed to start run")
}

export async function cancelRun(
  accessToken: string,
  runId: string
): Promise<void> {
  if (USE_DUMMY_DATA) return

  const resp = await authedFetch(
    `/api/runs/${runId}/cancel`,
    { method: "POST" },
    accessToken
  )
  if (!resp.ok) throw new Error("Failed to cancel run")
}

export async function rerunRun(
  accessToken: string,
  runId: string
): Promise<CreateRunResult> {
  if (USE_DUMMY_DATA) return { id: "run_7", runNumber: 7 }

  const resp = await authedFetch(
    `/api/runs/${runId}/rerun`,
    { method: "POST" },
    accessToken
  )
  if (!resp.ok) throw new Error("Failed to rerun")
  return (await resp.json()) as CreateRunResult
}

export async function approveDbPlan(
  accessToken: string,
  runId: string
): Promise<void> {
  if (USE_DUMMY_DATA) return

  const resp = await authedFetch(
    `/api/runs/${runId}/db-plan/approve`,
    { method: "POST" },
    accessToken
  )
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
  dbMigration?: { available: boolean; label: string }
}

export type RepoResolution =
  | { ok: true; repo: ResolvedRepo }
  | { ok: false; reason: "format" | "access" | "auth" }

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
  languages?: Record<string, number>
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
      percentage: 64,
      level: "medium",
      label: "Good migration candidate",
      selectable: true,
    },
    languages: { Java: 64, SQL: 18, Go: 10, Shell: 8 },
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

const DUMMY_REPO_SUGGESTIONS: RepoSuggestion[] = Object.entries(
  DUMMY_REPOS
).map(([fullName, repo]) => ({
  fullName,
  detectedLanguage: repo.detectedLanguage,
  detectedLabel: repo.detectedLabel,
  risk: repo.risk,
  languages: repo.languages,
}))

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
  accessToken: string
): Promise<RepoResolution> {
  const key = parseRepoInput(input)
  if (!key) return { ok: false, reason: "format" }

  if (USE_DUMMY_DATA) {
    const repo = Object.entries(DUMMY_REPOS).find(
      ([fullName]) => fullName.toLowerCase() === key.toLowerCase()
    )?.[1]
    return repo ? { ok: true, repo } : { ok: false, reason: "access" }
  }

  try {
    const resp = await authedFetch(
      `/api/github/repos/resolve?repo=${encodeURIComponent(key)}`,
      { cache: "no-store" },
      accessToken
    )
    // A 401 here means refresh also failed → the session is truly gone.
    if (resp.status === 401) return { ok: false, reason: "auth" }
    if (resp.status === 404) return { ok: false, reason: "access" }
    if (!resp.ok) return { ok: false, reason: "access" }
    const repo = (await resp.json()) as ResolvedRepo
    return { ok: true, repo }
  } catch {
    return { ok: false, reason: "access" }
  }
}

export async function fetchRepoSuggestions(
  accessToken: string
): Promise<RepoSuggestion[]> {
  if (USE_DUMMY_DATA) return DUMMY_REPO_SUGGESTIONS

  try {
    const resp = await authedFetch(
      `/api/github/repos/suggestions`,
      { cache: "no-store" },
      accessToken
    )
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
        : suggestion
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
  repo: string
): Promise<AppInstallation> {
  if (USE_DUMMY_DATA) return { installed: true, installUrl: "" }

  try {
    const resp = await authedFetch(
      `/api/github/app/installation?repo=${encodeURIComponent(repo)}`,
      { cache: "no-store" },
      accessToken
    )
    if (!resp.ok) return { installed: true, installUrl: "" }
    return (await resp.json()) as AppInstallation
  } catch {
    // On a check failure, don't block launch — the PR step still has fallbacks.
    return { installed: true, installUrl: "" }
  }
}

export { API_URL }
