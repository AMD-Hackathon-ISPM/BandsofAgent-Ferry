import * as React from "react"

import { AGENTS, type AgentKey } from "@/lib/domain"
import type { AgentRunStatus, Run } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AgentGlyph } from "@/features/migrations/components/agent"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CREW, CREW_ORDER, crewStation } from "./crew"

/**
 * Nautical watch label + tone + plain-language meaning per agent run status.
 * `plain` is the legend the nautical vocabulary otherwise lacks: it surfaces on
 * hover (tooltip) and in the row's aria-label so the persona never hides state.
 */
const WATCH: Record<
  AgentRunStatus,
  { label: string; tone: string; plain: string }
> = {
  idle: {
    label: "On station",
    tone: "var(--muted-foreground)",
    plain: "Idle — not started yet",
  },
  waiting: {
    label: "Standing by",
    tone: "var(--warning)",
    plain: "Waiting — ready, not yet engaged",
  },
  active: {
    label: "On watch",
    tone: "var(--signal)",
    plain: "Active — working now",
  },
  blocked: {
    label: "Held fast",
    tone: "var(--destructive)",
    plain: "Blocked — needs a decision",
  },
  // Finished agents recede: a neutral grey keeps "On watch" (signal-blue) the
  // only saturated status, so the eye lands on who's still working. (Was
  // --primary, which is the same blue-indigo family as --signal and made
  // done agents glow louder than active ones.)
  done: {
    label: "Watch ended",
    tone: "var(--muted-foreground)",
    plain: "Done — finished",
  },
}

/**
 * Crew-roster rail (like the reference layout): the nine agents shown as ferry
 * crew with their roleplay name + title and live watch status. Expanding a row
 * reveals the underlying system agent — its real name, role description and
 * current task — so the persona never hides what the agent actually does.
 */
export function CrewRoster({
  run,
  className,
}: {
  run: Run
  className?: string
}) {
  const [open, setOpen] = React.useState<AgentKey | null>(null)
  const statusOf = React.useMemo(() => {
    const m = new Map<AgentKey, AgentRunStatus>()
    for (const a of run.agents) m.set(a.key, a.status)
    return m
  }, [run.agents])
  const taskOf = React.useMemo(() => {
    const m = new Map<AgentKey, string | undefined>()
    for (const a of run.agents) m.set(a.key, a.currentTask)
    return m
  }, [run.agents])

  return (
    <section
      aria-label="Crew roster"
      className={cn("flex min-h-0 flex-col", className)}
    >
      <div className="border-b border-border px-3 py-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase">
          Crew roster
        </h2>
      </div>
      <TooltipProvider delayDuration={300}>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {CREW_ORDER.map((key) => {
            const meta = AGENTS[key]
            const crew = CREW[key]
            const status = statusOf.get(key) ?? "idle"
            const watch = WATCH[status]
            const station = crewStation(key)
            const isOpen = open === key
            return (
              <div key={key} className="px-1.5">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  aria-label={`${crew.name}, ${crew.title}. ${watch.plain}`}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded px-1.5 py-1.5 text-left transition-colors hover:bg-accent",
                    isOpen && "bg-accent"
                  )}
                >
                  <AgentGlyph
                    agent={key}
                    size="md"
                    active={status === "active"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground">
                      {crew.name}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      {crew.title}
                    </span>
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            status === "active" && "dot-pulse"
                          )}
                          style={{ backgroundColor: watch.tone }}
                        />
                        <span
                          className="font-mono text-[10px] tracking-wide uppercase"
                          style={{ color: watch.tone }}
                        >
                          {watch.label}
                        </span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left">{watch.plain}</TooltipContent>
                  </Tooltip>
                </button>

                {isOpen && (
                  <div className="mx-1.5 mb-1.5 rounded border border-border bg-background/40 px-2.5 py-2 text-[11px]">
                    <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                      System agent
                    </p>
                    <p
                      className="mt-0.5 text-xs font-medium"
                      style={{ color: meta.color }}
                    >
                      {meta.name}
                    </p>
                    <p className="mt-1 text-muted-foreground">{meta.role}</p>
                    {station && (
                      <p className="mt-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                        Post — {station.label.toLowerCase()}
                      </p>
                    )}
                    {taskOf.get(key) && (
                      <p className="mt-1 border-t border-border pt-1 text-muted-foreground">
                        <span className="text-foreground">Now:</span>{" "}
                        {taskOf.get(key)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </TooltipProvider>
    </section>
  )
}
