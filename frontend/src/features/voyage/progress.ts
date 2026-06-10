import { PHASES } from "@/lib/domain"
import type { Run } from "@/lib/types"
import { currentPhaseIndex } from "@/lib/pipeline"

export type VoyageMode =
  | "pending"
  | "sailing"
  | "arrived"
  | "failed"
  | "blocked"

export interface VoyageStatus {
  /** Voyage completion 0..1; the render loop eases toward this. */
  target: number
  mode: VoyageMode
}

export function deriveVoyage(run: Run): VoyageStatus {
  if (run.status === "completed") return { target: 1, mode: "arrived" }
  if (run.status === "pending") return { target: 0, mode: "pending" }

  const idx = currentPhaseIndex(run)
  // Mid-phase so the ship is visibly underway as soon as planning starts.
  const target = idx < 0 ? 0 : Math.min(1, (idx + 0.5) / PHASES.length)

  if (run.status === "failed") return { target, mode: "failed" }
  if (run.status === "blocked" || run.status === "needs_rework") {
    return { target, mode: "blocked" }
  }
  return { target, mode: "sailing" }
}
