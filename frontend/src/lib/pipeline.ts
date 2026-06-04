import { PHASES, PHASE_INDEX } from "@/lib/domain"
import type { Run } from "@/lib/types"

export type PhaseNodeState =
  | "done"
  | "active"
  | "blocked"
  | "failed"
  | "upcoming"
  | "skipped"

export function currentPhaseIndex(run: Run): number {
  if (run.status === "completed") return PHASES.length
  if (run.currentPhase) return PHASE_INDEX[run.currentPhase]
  return -1
}

export function phaseStates(run: Run): PhaseNodeState[] {
  const idx = currentPhaseIndex(run)
  return PHASES.map((phase, i) => {
    if (!run.project.dbEnabled && phase.key === "db_migration") return "skipped"
    if (run.status === "pending") return "upcoming"
    if (run.status === "completed") return "done"
    if (i < idx) return "done"
    if (i === idx) {
      if (run.status === "failed") return "failed"
      if (run.status === "blocked" || run.status === "needs_rework") return "blocked"
      return "active"
    }
    return "upcoming"
  })
}
