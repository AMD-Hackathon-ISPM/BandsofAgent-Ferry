import * as React from "react"
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
  done: "text-foreground/80",
  active: "text-signal",
  blocked: "text-warning",
  failed: "text-destructive",
  upcoming: "text-muted-foreground/55",
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
    <ol className={cn("flex items-center", className)}>
      {PHASES.map((phase, i) => {
        const state = states[i]
        const isSelected = selected === phase.key
        const interactive = state !== "skipped" && state !== "upcoming"
        const connectorDone = state === "done"
        return (
          <React.Fragment key={phase.key}>
            <li className="relative shrink-0">
              <button
                type="button"
                disabled={!interactive}
                onClick={() => onSelect?.(isSelected ? null : phase.key)}
                aria-pressed={isSelected}
                aria-label={`${phase.label} phase, ${state}`}
                title={phase.hint}
                className={cn(
                  // 28px node, 44px hit target via the inset pseudo-element
                  "relative flex size-7 items-center justify-center border outline-none transition-colors",
                  "before:absolute before:-inset-2 before:content-['']",
                  "focus-visible:ring-1 focus-visible:ring-ring",
                  interactive ? "cursor-pointer" : "cursor-default",
                  NODE[state],
                  isSelected && "ring-1 ring-signal/60 ring-offset-1 ring-offset-background",
                )}
              >
                <NodeMark state={state} index={i} />
              </button>
              <span
                className={cn(
                  "pointer-events-none absolute top-full left-1/2 mt-1.5 hidden -translate-x-1/2 text-[11px] font-medium whitespace-nowrap sm:block",
                  LABEL[state],
                )}
              >
                {phase.short}
              </span>
            </li>
            {i < PHASES.length - 1 && (
              <li
                aria-hidden="true"
                className={cn(
                  "h-px min-w-3 flex-1 transition-colors",
                  connectorDone ? "bg-success/40" : "bg-border",
                )}
              />
            )}
          </React.Fragment>
        )
      })}
    </ol>
  )
}
