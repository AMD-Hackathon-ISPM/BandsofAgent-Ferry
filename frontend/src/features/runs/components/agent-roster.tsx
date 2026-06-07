import { AGENTS, AGENT_ORDER, type AgentKey } from "@/lib/domain"
import { relativeTime } from "@/lib/format"
import type { AgentRuntime, Run } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AgentGlyph } from "@/features/migrations/components/agent"
import { AgentStatusDot } from "@/features/migrations/components/status-dot"

function RosterRow({
  runtime,
  selected,
  onSelect,
  now,
}: {
  runtime: AgentRuntime
  selected: boolean
  onSelect: () => void
  now: number
}) {
  const meta = AGENTS[runtime.key]
  const isActive = runtime.status === "active"
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors outline-none",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        selected ? "bg-accent" : "hover:bg-accent/40"
      )}
    >
      <AgentGlyph agent={runtime.key} size="md" active={isActive} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span
            className="truncate text-xs font-medium"
            style={{ color: meta.color }}
          >
            {meta.name}
          </span>
          <AgentStatusDot status={runtime.status} className="shrink-0" />
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-muted-foreground">
            {runtime.currentTask ?? meta.role}
          </span>
          {runtime.lastActionAt && (
            <time className="shrink-0 text-[10px] text-muted-foreground/70">
              {relativeTime(runtime.lastActionAt, now)}
            </time>
          )}
        </span>
      </span>
    </button>
  )
}

export function AgentRoster({
  run,
  selected,
  onSelect,
  now,
  className,
}: {
  run: Run
  selected?: AgentKey | null
  onSelect?: (agent: AgentKey | null) => void
  now: number
  className?: string
}) {
  const byKey = new Map(run.agents.map((a) => [a.key, a]))
  const activeCount = run.agents.filter((a) => a.status === "active").length

  return (
    <section
      className={cn("flex flex-col", className)}
      aria-label="Agent roster"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase">
          The band
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {activeCount > 0 ? (
            <span className="text-signal">{activeCount} active</span>
          ) : (
            <span>{run.agents.length} agents</span>
          )}
        </span>
      </div>
      <div className="flex flex-col">
        {AGENT_ORDER.map((key) => {
          const runtime = byKey.get(key) ?? { key, status: "idle" as const }
          return (
            <RosterRow
              key={key}
              runtime={runtime}
              selected={selected === key}
              onSelect={() => onSelect?.(selected === key ? null : key)}
              now={now}
            />
          )
        })}
      </div>
    </section>
  )
}
