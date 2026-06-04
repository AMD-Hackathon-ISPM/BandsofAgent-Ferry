import { IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react"

import { PHASES, type PhaseKey } from "@/lib/domain"
import { phaseStates, type PhaseNodeState } from "@/lib/pipeline"
import type { Run } from "@/lib/types"
import { cn } from "@/lib/utils"

const NODE: Record<PhaseNodeState, string> = {
  done: "border-success/40 bg-success/12 text-success",
  active: "border-signal bg-signal/15 text-signal live-ring",
  blocked: "border-warning bg-warning/15 text-warning dot-pulse",
  failed: "border-destructive bg-destructive/15 text-destructive",
  upcoming: "border-border bg-muted/30 text-muted-foreground/70",
  skipped: "border-dashed border-border bg-transparent text-muted-foreground/40",
}

const LABEL: Record<PhaseNodeState, string> = {
  done: "text-foreground",
  active: "text-signal",
  blocked: "text-warning",
  failed: "text-destructive",
  upcoming: "text-muted-foreground/60",
  skipped: "text-muted-foreground/40",
}

function NodeMark({ state, index }: { state: PhaseNodeState; index: number }) {
  if (state === "done") return <IconCheck className="size-3.5" />
  if (state === "failed") return <IconX className="size-3.5" />
  if (state === "blocked") return <IconAlertTriangle className="size-3.5" />
  if (state === "active")
    return <span className="size-2 rounded-full bg-signal dot-pulse" aria-hidden="true" />
  return <span className="tabular text-[11px] font-medium">{index + 1}</span>
}

export function PhasePipeline({
  run,
  selected,
  onSelect,
  className,
}: {
  run: Run
  selected?: PhaseKey | null
  onSelect?: (phase: PhaseKey | null) => void
  className?: string
}) {
  const states = phaseStates(run)

  return (
    <div className={cn("overflow-x-auto", className)}>
      <ol className="flex min-w-max items-start">
        {PHASES.map((phase, i) => {
          const state = states[i]
          const isSelected = selected === phase.key
          const connectorDone = states[i] === "done"
          const interactive = state !== "skipped" && state !== "upcoming"
          return (
            <li key={phase.key} className="flex items-start">
              <button
                type="button"
                disabled={!interactive}
                onClick={() => onSelect?.(isSelected ? null : phase.key)}
                aria-pressed={isSelected}
                aria-label={`${phase.label} phase, ${state}`}
                title={phase.hint}
                className={cn(
                  "group/phase flex w-[88px] flex-col items-center gap-1.5 px-1 pt-0.5 pb-1 outline-none",
                  interactive ? "cursor-pointer" : "cursor-default",
                  "focus-visible:ring-1 focus-visible:ring-ring",
                )}
              >
                <span
                  className={cn(
                    "relative flex size-7 items-center justify-center border transition-colors",
                    NODE[state],
                    isSelected && "ring-1 ring-signal/60 ring-offset-1 ring-offset-background",
                  )}
                >
                  <NodeMark state={state} index={i} />
                </span>
                <span className={cn("max-w-full truncate text-[11px] font-medium", LABEL[state])}>
                  {phase.short}
                </span>
              </button>
              {i < PHASES.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-3.5 h-px w-5 shrink-0 sm:w-8",
                    connectorDone ? "bg-success/40" : "bg-border",
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
