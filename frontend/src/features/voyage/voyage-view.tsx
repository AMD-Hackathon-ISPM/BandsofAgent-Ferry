import * as React from "react"

import type { AgentKey } from "@/lib/domain"
import { AGENTS, AGENT_ORDER, PHASES, STATUS } from "@/lib/domain"
import type { AgentMessageVM, Run } from "@/lib/types"
import {
  currentPhaseIndex,
  phaseStates,
  type PhaseNodeState,
} from "@/lib/pipeline"
import { cn } from "@/lib/utils"
import { deriveVoyage, type VoyageStatus } from "./progress"
import { useVoyageScene } from "./use-voyage-scene"
import { ShipLog } from "./ship-log"

export function VoyageView(props: {
  run: Run
  messages: AgentMessageVM[]
  streamedIds: Set<string>
  /** Reserved for the future zoom-into-the-ship interior mode. */
  selectedAgent?: AgentKey | null
  onSelectAgent?: (a: AgentKey | null) => void
  className?: string
  /** Hide the floating ship's log overlay (when it is docked elsewhere). */
  showLog?: boolean
  progressClassName?: string
}) {
  const {
    run,
    messages,
    streamedIds,
    className,
    showLog = true,
    progressClassName,
  } = props
  const voyage = deriveVoyage(run)
  const [inspecting, setInspecting] = React.useState(false)
  const { wrapRef, canvasRef } = useVoyageScene(voyage, {
    onInspectChange: setInspecting,
  })

  return (
    <section
      className={cn("absolute inset-0 overflow-hidden", className)}
      aria-label="Voyage visualization"
    >
      <div
        ref={wrapRef}
        className="absolute inset-0 overflow-hidden bg-[#111a33]"
      >
        <canvas ref={canvasRef} className="pixel-canvas block" />
      </div>

      <div
        aria-hidden={!inspecting}
        className={cn(
          "pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card/85 px-3 py-1.5 font-mono text-[10px] tracking-wide text-muted-foreground shadow-lg backdrop-blur-sm transition-opacity duration-300",
          inspecting ? "opacity-100" : "opacity-0"
        )}
      >
        Drag or arrow keys to pan — Esc to return
      </div>

      {showLog && (
        <ShipLog messages={messages} streamedIds={streamedIds} />
      )}
      <VoyageProgress run={run} voyage={voyage} className={progressClassName} />
    </section>
  )
}

const SEGMENT_COLOR: Record<PhaseNodeState, string> = {
  done: "var(--primary)",
  active: "var(--signal)",
  blocked: "var(--warning)",
  failed: "var(--destructive)",
  upcoming: "var(--border)",
  skipped: "var(--border)",
}

function voyageLabel(run: Run, voyage: VoyageStatus): string {
  if (voyage.mode === "blocked" && run.status === "needs_rework") {
    const agent = AGENTS[AGENT_ORDER[voyage.stop]]
    return `Returning - ${agent.name.toLowerCase()} refine`
  }
  switch (voyage.mode) {
    case "pending":
      return "At anchor — awaiting departure"
    case "arrived":
      return "Docked — migration shipped"
    case "failed":
      return "Adrift — run failed"
    case "blocked":
      return `Heaved to — ${STATUS[run.status].label.toLowerCase()}`
    case "sailing": {
      const idx = currentPhaseIndex(run)
      const phase = PHASES[Math.min(Math.max(idx, 0), PHASES.length - 1)]
      return `En route — ${phase.label.toLowerCase()}`
    }
  }
}

function VoyageProgress({
  run,
  voyage,
  className,
}: {
  run: Run
  voyage: VoyageStatus
  className?: string
}) {
  const states = phaseStates(run)

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2",
        className
      )}
    >
      <div className="flex flex-col items-center gap-1.5 rounded-md border border-border bg-card/85 px-3 py-2 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-1" aria-hidden="true">
          {states.map((state, i) => (
            <span
              key={PHASES[i].key}
              title={PHASES[i].label}
              className={cn(
                "h-1 w-6 rounded-full",
                state === "active" && "dot-pulse",
                state === "skipped" && "opacity-40"
              )}
              style={{ backgroundColor: SEGMENT_COLOR[state] }}
            />
          ))}
        </div>
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground">
          {voyageLabel(run, voyage)}
        </p>
      </div>
    </div>
  )
}
