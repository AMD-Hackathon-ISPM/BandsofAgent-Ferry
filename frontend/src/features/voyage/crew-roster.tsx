import * as React from "react"

import { AGENTS, type AgentKey } from "@/lib/domain"
import type { AgentRunStatus, Run } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AgentGlyph } from "@/features/migrations/components/agent"
import { CREW, CREW_ORDER, crewStation } from "./crew"

/** Nautical watch label + tone per agent run status. */
const WATCH: Record<AgentRunStatus, { label: string; tone: string }> = {
  idle: { label: "On station", tone: "var(--muted-foreground)" },
  waiting: { label: "Standing by", tone: "var(--warning)" },
  active: { label: "On watch", tone: "var(--signal)" },
  blocked: { label: "Held fast", tone: "var(--destructive)" },
  done: { label: "Watch ended", tone: "var(--primary)" },
}

/**
 * Crew-roster rail (like the reference layout): the nine agents shown as ferry
 * crew with their roleplay name + title and live watch status. Expanding a row
 * reveals the underlying system agent — its real name, role description and
 * current task — so the persona never hides what the agent actually does.
 */
export function CrewRoster({
  run,
  visible,
  className,
}: {
  run: Run
  visible: boolean
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
    <aside
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none absolute top-4 right-4 bottom-4 z-10 flex w-64 max-w-[calc(100%-2rem)] flex-col rounded-md border border-border bg-card/90 shadow-lg backdrop-blur-sm transition-opacity duration-300",
        visible ? "pointer-events-auto opacity-100" : "opacity-0",
        className
      )}
    >
      <div className="border-b border-border px-3 py-2">
        <span className="font-mono text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Crew roster
        </span>
      </div>
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
                className={cn(
                  "flex w-full items-center gap-2.5 rounded px-1.5 py-1.5 text-left transition-colors hover:bg-accent",
                  isOpen && "bg-accent"
                )}
              >
                <AgentGlyph agent={key} size="md" active={status === "active"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {crew.name}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {crew.title}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      status === "active" && "dot-pulse"
                    )}
                    style={{ backgroundColor: watch.tone }}
                  />
                  <span
                    className="font-mono text-[9px] tracking-wide uppercase"
                    style={{ color: watch.tone }}
                  >
                    {watch.label}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="mx-1.5 mb-1.5 rounded border border-border bg-background/40 px-2.5 py-2 text-[11px]">
                  <p className="font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
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
                    <p className="mt-1.5 font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
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
    </aside>
  )
}
