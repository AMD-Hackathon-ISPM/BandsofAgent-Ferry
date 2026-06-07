import type { RecentRunSummary, Run } from "@/lib/types"

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
  const resp = await fetch(`${API_URL}/api/runs/${runId}/start`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
  if (!resp.ok) throw new Error("Failed to start run")
}

export async function cancelRun(accessToken: string, runId: string): Promise<void> {
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
  const resp = await fetch(`${API_URL}/api/runs/${runId}/rerun`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
  if (!resp.ok) throw new Error("Failed to rerun")
  return (await resp.json()) as CreateRunResult
}

export async function approveDbPlan(accessToken: string, runId: string): Promise<void> {
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
}

export type RepoResolution =
  | { ok: true; repo: ResolvedRepo }
  | { ok: false; reason: "format" | "access" }

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

  try {
    const resp = await fetch(
      `${API_URL}/api/github/repos/resolve?repo=${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (resp.status === 404) return { ok: false, reason: "access" }
    if (!resp.ok) return { ok: false, reason: "access" }
    const repo = (await resp.json()) as ResolvedRepo
    return { ok: true, repo }
  } catch {
    return { ok: false, reason: "access" }
  }
}

export async function fetchRepoSuggestions(accessToken: string): Promise<string[]> {
  try {
    const resp = await fetch(`${API_URL}/api/github/repos/suggestions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) return []
    return (await resp.json()) as string[]
  } catch {
    return []
  }
}

export { API_URL }
