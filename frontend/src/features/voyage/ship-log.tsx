import { AGENTS, type MessageType } from "@/lib/domain"
import type { AgentMessageVM } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AgentGlyph } from "@/features/migrations/components/agent"

const VERB: Record<MessageType, string> = {
  finding: "Sighted by",
  task_request: "Orders passed to",
  handoff: "Cargo handed to",
  review: "Inspection by",
  decision: "Course set by",
  artifact_created: "Crate stowed by",
  blocker: "Held — flagged by",
}

function clockTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "--:--"
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export function ShipLog({
  messages,
  streamedIds,
  className,
}: {
  messages: AgentMessageVM[]
  streamedIds: Set<string>
  className?: string
}) {
  const recent = messages.slice(-6).reverse()

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 left-3 z-10 w-72 max-w-[calc(100%-1.5rem)]",
        className
      )}
    >
      <div className="pointer-events-auto overflow-hidden rounded-md border border-border bg-card/85 shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Ship&apos;s log
          </span>
          <span
            className="dot-pulse size-1.5 rounded-full bg-signal"
            aria-hidden="true"
          />
        </div>
        {recent.length === 0 ? (
          <p className="px-3 py-3 text-[11px] text-muted-foreground">
            Nothing in the log yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {recent.map((m) => {
              const meta = AGENTS[m.agent]
              return (
                <li
                  key={m.id}
                  className={cn(
                    "flex items-start gap-2 px-3 py-1.5",
                    streamedIds.has(m.id) && "stream-in"
                  )}
                >
                  <AgentGlyph agent={m.agent} size="sm" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] leading-tight">
                      <span className="text-muted-foreground">
                        {VERB[m.type]}{" "}
                      </span>
                      <span style={{ color: meta.color }}>{meta.name}</span>
                    </p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground/80">
                      {m.summary}
                    </p>
                  </div>
                  <time
                    className="shrink-0 text-[10px] text-muted-foreground/70"
                    dateTime={m.createdAt}
                  >
                    {clockTime(m.createdAt)}
                  </time>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
