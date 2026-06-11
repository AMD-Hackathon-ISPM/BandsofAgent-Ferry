import {
  AGENT_ORDER,
  PHASES,
  type AgentKey,
  type MigrationStatus,
} from "@/lib/domain"
import type { Run } from "@/lib/types"
import { currentPhaseIndex } from "@/lib/pipeline"

export type VoyageMode =
  | "pending"
  | "sailing"
  | "arrived"
  | "failed"
  | "blocked"

export type HarborState =
  | "done"
  | "active"
  | "upcoming"
  | "skipped"
  | "failed"
  | "blocked"

export interface VoyageStatus {
  /** Voyage completion 0..1; the render loop eases toward this. */
  target: number
  mode: VoyageMode
  /** Current agent harbor, 0..8. */
  stop: number
  harborStates: HarborState[]
}

export const VOYAGE_STOP_COUNT = AGENT_ORDER.length

const STATUS_STOP: Record<MigrationStatus, number> = {
  pending: 0,
  planning: 0,
  analyzing: 2,
  translating: 3,
  db_migration: 4,
  testing: 5,
  reviewing: 6,
  generating_pr: 8,
  completed: 8,
  failed: 0,
  blocked: 0,
  needs_rework: 3,
}

const agentIndex = new Map<AgentKey, number>(
  AGENT_ORDER.map((agent, index) => [agent, index])
)

function fallbackStop(run: Run): number {
  if (
    run.status === "failed" ||
    run.status === "blocked" ||
    run.status === "needs_rework"
  ) {
    const idx = currentPhaseIndex(run)
    if (idx < 0) return 0
    return Math.min(8, Math.round((idx / Math.max(1, PHASES.length - 1)) * 8))
  }
  return STATUS_STOP[run.status]
}

function deriveStop(run: Run): number {
  if (run.status === "needs_rework") {
    const latestAction = [...run.messages]
      .reverse()
      .find((message) => message.requiresAction || message.targetAgent)
    if (latestAction?.targetAgent) {
      return agentIndex.get(latestAction.targetAgent) ?? STATUS_STOP.needs_rework
    }
    return STATUS_STOP.needs_rework
  }

  let stop = fallbackStop(run)
  for (const message of run.messages) {
    stop = Math.max(stop, agentIndex.get(message.agent) ?? 0)
  }
  for (const artifact of run.artifacts) {
    stop = Math.max(stop, agentIndex.get(artifact.createdBy) ?? 0)
  }
  return Math.min(VOYAGE_STOP_COUNT - 1, stop)
}

function stopTarget(stop: number): number {
  return stop / Math.max(1, VOYAGE_STOP_COUNT - 1)
}

function latestReworkSignal(run: Run) {
  return [...run.messages].reverse().find((message) => {
    const payload = message.payload ? JSON.stringify(message.payload) : ""
    const text = `${message.summary} ${payload}`.toLowerCase()
    return (
      text.includes("needs_rework") ||
      text.includes("needs rework") ||
      text.includes("rework")
    )
  })
}

function harborStates(run: Run, stop: number, mode: VoyageMode): HarborState[] {
  return AGENT_ORDER.map((agent, index) => {
    if (agent === "db_migration" && !run.project.dbEnabled) return "skipped"
    if (index === stop) {
      if (mode === "failed") return "failed"
      if (mode === "blocked") return "blocked"
      return "active"
    }
    if (index < stop) return "done"
    return "upcoming"
  })
}

function status(run: Run, stop: number, mode: VoyageMode): VoyageStatus {
  return {
    target: stopTarget(stop),
    mode,
    stop,
    harborStates: harborStates(run, stop, mode),
  }
}

export function deriveVoyage(run: Run): VoyageStatus {
  const reworkSignal = latestReworkSignal(run)
  const stop = reworkSignal
    ? agentIndex.get(reworkSignal.targetAgent ?? "code_generator") ??
      STATUS_STOP.needs_rework
    : deriveStop(run)
  if (run.status === "completed") return status(run, 8, "arrived")
  if (run.status === "pending") return status(run, stop, "pending")

  if (run.status === "failed") return status(run, stop, "failed")
  if (run.status === "blocked" || run.status === "needs_rework") {
    return status(run, stop, "blocked")
  }
  return status(run, stop, "sailing")
}
