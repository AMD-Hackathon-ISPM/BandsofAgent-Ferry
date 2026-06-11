import * as React from "react"
import { IconX } from "@tabler/icons-react"

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

const HARBOR_PHASE_LABELS = [
  "Planning",
  "Source mapping",
  "Business rules",
  "Target code",
  "Database move",
  "Behavior tests",
  "Artifact review",
  "Final decision",
  "Pull request",
]

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
  const [selectedHarbor, setSelectedHarbor] = React.useState<number | null>(null)
  const { wrapRef, canvasRef } = useVoyageScene(voyage, {
    onHarborClick: (index) => {
      setSelectedHarbor(index)
      props.onSelectAgent?.(AGENT_ORDER[index])
    },
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

      {showLog && (
        <ShipLog messages={messages} streamedIds={streamedIds} />
      )}
      {selectedHarbor !== null && (
        <HarborPopup
          run={run}
          voyage={voyage}
          index={selectedHarbor}
          onClose={() => setSelectedHarbor(null)}
        />
      )}
      <VoyageProgress run={run} voyage={voyage} className={progressClassName} />
    </section>
  )
}

function harborStatusLabel(state: VoyageStatus["harborStates"][number]): string {
  switch (state) {
    case "done":
      return "Visited"
    case "active":
      return "Current harbor"
    case "failed":
      return "Failed here"
    case "blocked":
      return "Needs attention"
    case "skipped":
      return "Skipped"
    case "upcoming":
      return "Ahead"
  }
}

function HarborPopup({
  run,
  voyage,
  index,
  onClose,
}: {
  run: Run
  voyage: VoyageStatus
  index: number
  onClose: () => void
}) {
  const agent = AGENT_ORDER[index]
  const meta = AGENTS[agent]
  const state = voyage.harborStates[index] ?? "upcoming"
  const messages = run.messages.filter((message) => message.agent === agent)
  const artifacts = run.artifacts.filter((artifact) => artifact.createdBy === agent)
  const isDbSkipped = agent === "db_migration" && !run.project.dbEnabled
  const latestMessage = messages[messages.length - 1]

  return (
    <aside
      className="pointer-events-auto absolute top-16 left-1/2 z-20 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 rounded-md border border-border bg-card/95 shadow-2xl backdrop-blur-sm xl:top-16"
      style={{ boxShadow: `0 0 0 1px color-mix(in srgb, ${meta.color} 42%, transparent)` }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[10px] text-muted-foreground uppercase">
            Harbor {index + 1} / {AGENT_ORDER.length}
          </p>
          <h3 className="mt-1 truncate text-sm font-semibold" style={{ color: meta.color }}>
            {meta.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Close harbor details"
        >
          <IconX className="size-4" />
        </button>
      </div>
      <div className="space-y-3 px-3 py-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{HARBOR_PHASE_LABELS[index]}</span>
          <span
            className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase"
            style={{ borderColor: meta.color, color: meta.color }}
          >
            {isDbSkipped ? "Skipped" : harborStatusLabel(state)}
          </span>
        </div>
        <p className="leading-relaxed text-muted-foreground">{meta.role}.</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-border bg-background/70 px-2 py-2">
            <p className="font-mono text-[10px] text-muted-foreground uppercase">
              Messages
            </p>
            <p className="mt-1 text-lg font-semibold">{messages.length}</p>
          </div>
          <div className="rounded border border-border bg-background/70 px-2 py-2">
            <p className="font-mono text-[10px] text-muted-foreground uppercase">
              Artifacts
            </p>
            <p className="mt-1 text-lg font-semibold">{artifacts.length}</p>
          </div>
        </div>
        <p className="line-clamp-2 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground">
          {latestMessage?.summary ??
            (isDbSkipped
              ? "Database migration is not required for this project."
              : "No dock report has been posted yet.")}
        </p>
      </div>
    </aside>
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
