import type { AgentKey } from "@/lib/domain"
import type { AgentMessageVM, Run } from "@/lib/types"
import { cn } from "@/lib/utils"
import { HarborMap } from "./harbor-map"
import { HarborTicker } from "./components/ticker"

const LEGEND: Array<{ label: string; color: string }> = [
  { label: "Running", color: "var(--signal)" },
  { label: "Waiting", color: "var(--warning)" },
  { label: "Shipped", color: "var(--success)" },
  { label: "Failed", color: "var(--destructive)" },
  { label: "Idle", color: "var(--muted-foreground)" },
]

export function HarborView({
  run,
  messages,
  streamedIds,
  selectedAgent,
  onSelectAgent,
  className,
}: {
  run: Run
  messages: AgentMessageVM[]
  streamedIds: Set<string>
  selectedAgent?: AgentKey | null
  onSelectAgent?: (a: AgentKey | null) => void
  className?: string
}) {
  return (
    <section
      className={cn("relative flex min-h-0 flex-col", className)}
      aria-label="Harbor visualization"
    >
      <HarborMap
        run={run}
        selectedAgent={selectedAgent}
        onSelectAgent={onSelectAgent}
      />

      <HarborTicker messages={messages} streamedIds={streamedIds} />

      <div className="pointer-events-none absolute right-3 bottom-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card/85 px-3 py-1.5 shadow-sm backdrop-blur-sm">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: l.color }}
              aria-hidden="true"
            />
            {l.label}
          </span>
        ))}
      </div>
    </section>
  )
}
