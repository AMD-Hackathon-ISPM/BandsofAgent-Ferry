import type { RecentRunSummary, Run } from "@/lib/types"
import { RECENT_RUNS, getRun } from "@/lib/mock/data"

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
  detectedLanguage: "cobol" | "java" | "php" | "unsupported"
  detectedLabel: string
}

const REPO_FIXTURES: Record<string, ResolvedRepo> = {
  "northwind/payroll-cobol": {
    owner: "northwind",
    name: "payroll-cobol",
    defaultBranch: "main",
    detectedLanguage: "cobol",
    detectedLabel: "COBOL",
  },
  "northwind/ledger-java": {
    owner: "northwind",
    name: "ledger-java",
    defaultBranch: "main",
    detectedLanguage: "java",
    detectedLabel: "Java",
  },
  "northwind/claims-php": {
    owner: "northwind",
    name: "claims-php",
    defaultBranch: "trunk",
    detectedLanguage: "php",
    detectedLabel: "PHP",
  },
  "northwind/web-dashboard": {
    owner: "northwind",
    name: "web-dashboard",
    defaultBranch: "main",
    detectedLanguage: "unsupported",
    detectedLabel: "TypeScript",
  },
}

export type RepoResolution =
  | { ok: true; repo: ResolvedRepo }
  | { ok: false; reason: "format" | "access" }

export async function resolveRepo(input: string): Promise<RepoResolution> {
  await latency(650)
  const match = input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "")
  const parts = match.split("/")
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "format" }
  }
  const key = `${parts[0]}/${parts[1]}`
  const repo = REPO_FIXTURES[key]
  if (!repo) {
    return { ok: false, reason: "access" }
  }
  return { ok: true, repo }
}

export const REPO_SUGGESTIONS = Object.keys(REPO_FIXTURES).filter(
  (k) => k !== "northwind/web-dashboard",
)
