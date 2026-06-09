import { PHASES, PHASE_INDEX, STATUS, type PhaseKey } from "@/lib/domain"
import type { Run } from "@/lib/types"

export type PhaseNodeState =
  | "done"
  | "active"
  | "blocked"
  | "failed"
  | "upcoming"
  | "skipped"

export function effectiveCurrentPhase(run: Run): PhaseKey | null {
  let phase = run.currentPhase ?? STATUS[run.status].phase

  for (const message of run.messages) {
    if (!phase || PHASE_INDEX[message.phase] > PHASE_INDEX[phase]) {
      phase = message.phase
    }
  }

  return phase
}

export function currentPhaseIndex(run: Run): number {
  if (run.status === "completed") return PHASES.length
  const phase = effectiveCurrentPhase(run)
  if (phase) return PHASE_INDEX[phase]
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
