import * as React from "react"
import {
  IconAlertTriangle,
  IconCheck,
  IconChecklist,
  IconCode,
  IconDatabase,
  IconFileSearch,
  IconGitPullRequest,
  IconSitemap,
  IconTestPipe,
  IconX,
} from "@tabler/icons-react"

import { PHASES, type PhaseKey } from "@/lib/domain"
import { phaseStates, type PhaseNodeState } from "@/lib/pipeline"
import type { Run } from "@/lib/types"
import { cn } from "@/lib/utils"

const STAGE: Record<PhaseNodeState, string> = {
  done: "border-success/35 bg-success/8 text-success",
  active:
    "border-signal bg-signal/12 text-signal phase-active-glow shadow-[0_0_28px_color-mix(in_oklch,var(--signal)_26%,transparent)]",
  blocked: "border-warning/45 bg-warning/12 text-warning",
  failed: "border-destructive/45 bg-destructive/12 text-destructive",
  upcoming: "border-border bg-background/40 text-muted-foreground/45",
  skipped:
    "border-dashed border-border bg-transparent text-muted-foreground/35",
}

const CONNECTOR: Record<PhaseNodeState, string> = {
  done: "bg-success/35",
  active: "bg-success/35",
  blocked: "bg-warning/35",
  failed: "bg-destructive/35",
  upcoming: "bg-border",
  skipped: "bg-border/60",
}

const PHASE_ICON: Record<PhaseKey, typeof IconSitemap> = {
  planning: IconSitemap,
  analysis: IconFileSearch,
  translation: IconCode,
  db_migration: IconDatabase,
  testing: IconTestPipe,
  review: IconChecklist,
  pr_generation: IconGitPullRequest,
}

function StageMark({
  phase,
  state,
}: {
  phase: PhaseKey
  state: PhaseNodeState
}) {
  if (state === "done") return <IconCheck className="size-5" />
  if (state === "failed") return <IconX className="size-5" />
  if (state === "blocked") return <IconAlertTriangle className="size-5" />
  const Icon = PHASE_ICON[phase]
  return <Icon className="size-5" />
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
      <ol className="mx-auto flex min-w-max items-center justify-center">
        {PHASES.map((phase, i) => {
          const state = states[i]
          const nextState = states[i + 1]
          const isSelected = selected === phase.key
          const interactive = state !== "skipped" && state !== "upcoming"
          const connectorActive = state === "done" && nextState === "active"

          return (
            <React.Fragment key={phase.key}>
              <li className="shrink-0">
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => onSelect?.(isSelected ? null : phase.key)}
                  aria-pressed={isSelected}
                  aria-label={`${phase.label} phase, ${state}`}
                  title={phase.hint}
                  className={cn(
                    "flex h-12 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors outline-none",
                    "focus-visible:ring-1 focus-visible:ring-ring",
                    interactive ? "cursor-pointer" : "cursor-default",
                    STAGE[state],
                    isSelected &&
                      "ring-1 ring-signal/70 ring-offset-2 ring-offset-background"
                  )}
                >
                  <StageMark phase={phase.key} state={state} />
                  <span>{phase.short}</span>
                </button>
              </li>
              {i < PHASES.length - 1 && (
                <li
                  aria-hidden="true"
                  className={cn(
                    "relative h-px w-14 overflow-hidden",
                    CONNECTOR[state]
                  )}
                >
                  {connectorActive && (
                    <span className="data-transfer absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-signal to-transparent" />
                  )}
                </li>
              )}
            </React.Fragment>
          )
        })}
      </ol>
    </div>
  )
}
