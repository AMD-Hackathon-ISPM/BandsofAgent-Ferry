import type { RecentRunSummary, Run } from "@/lib/types"
import { RECENT_RUNS, getRun } from "@/lib/mock/data"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080"

const latency = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fetchRecentRuns(): Promise<RecentRunSummary[]> {
  await latency(550)
  return RECENT_RUNS
}

export async function fetchRun(id: string): Promise<Run> {
  await latency(450)
  const run = getRun(id)
  if (!run) {
    throw new Error(`Run ${id} was not found.`)
  }
  return run
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
