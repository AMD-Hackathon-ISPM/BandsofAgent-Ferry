import { AGENT_ORDER, type AgentKey, type StatusTone } from "@/lib/domain"
import type { Run } from "@/lib/types"
import { CARGO_LANE } from "./layout"

export type FacilityVisual =
  | "idle"
  | "waiting"
  | "running"
  | "success"
  | "failed"
  | "skipped"

export interface HarborState {
  facility: Record<AgentKey, FacilityVisual>
  lastActive: AgentKey | null
  laneProgress: number
  departed: boolean
}

export const VISUAL_TONE: Record<FacilityVisual, StatusTone | null> = {
  idle: null,
  waiting: "warning",
  running: "live",
  success: "success",
  failed: "danger",
  skipped: null,
}

export const VISUAL_ACCENT: Record<FacilityVisual, string | null> = {
  idle: null,
  waiting: "var(--warning)",
  running: "var(--signal)",
  success: "var(--success)",
  failed: "var(--destructive)",
  skipped: null,
}

export function deriveHarborState(run: Run): HarborState {
  const byKey = new Map(run.agents.map((a) => [a.key, a]))
  const failed = run.status === "failed"
  const completed = run.status === "completed"

  let lastActive: AgentKey | null = null
  for (let i = run.messages.length - 1; i >= 0; i--) {
    const k = run.messages[i].agent
    if (AGENT_ORDER.includes(k)) {
      lastActive = k
      break
    }
  }

  const facility = {} as Record<AgentKey, FacilityVisual>
  for (const key of AGENT_ORDER) {
    if (key === "db_migration" && !run.project.dbEnabled) {
      facility[key] = "skipped"
      continue
    }
    const status = byKey.get(key)?.status ?? "idle"
    if (failed && key === lastActive) {
      facility[key] = "failed"
    } else if (status === "active") {
      facility[key] = "running"
    } else if (status === "blocked") {
      facility[key] = "waiting"
    } else if (status === "done") {
      facility[key] = "success"
    } else if (completed) {
      facility[key] = "success"
    } else {
      facility[key] = "idle"
    }
  }

  let laneProgress = 0
  for (const key of CARGO_LANE) {
    const v = facility[key]
    if (v === "success" || v === "skipped") laneProgress++
    else break
  }

  return { facility, lastActive, laneProgress, departed: completed }
}

export { usePrefersReducedMotion } from "@/lib/hooks"
