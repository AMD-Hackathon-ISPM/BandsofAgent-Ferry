import * as React from "react"
import {
  IconAlertTriangle,
  IconArrowDown,
  IconChevronRight,
  IconFile,
  IconX,
} from "@tabler/icons-react"

import {
  AGENTS,
  MESSAGE_TYPES,
  PHASES,
  PHASE_INDEX,
  isLive,
  type AgentKey,
  type PhaseKey,
} from "@/lib/domain"
import { relativeTime } from "@/lib/format"
import type { AgentMessageVM, Run } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AgentGlyph } from "@/features/migrations/components/agent"
import { BandChatter } from "@/features/runs/components/band-chatter"
import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

const TYPE_TONE: Record<string, string> = {
  neutral: "text-muted-foreground",
  accent: "text-primary-bright",
  signal: "text-signal",
  success: "text-success",
  warning: "text-warning",
}

function PrimitiveValue({ value }: { value: unknown }) {
  if (typeof value === "boolean")
    return (
      <span className={value ? "text-warning" : "text-muted-foreground"}>
        {String(value)}
      </span>
    )
  if (typeof value === "number")
    return (
      <span className="tabular text-foreground">{value.toLocaleString()}</span>
    )
  return <span className="text-foreground">{String(value)}</span>
}

function PayloadView({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(
    ([k]) => k !== "file" && k !== "artifact" && k !== "content"
  )
  if (entries.length === 0) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 bg-muted/40 p-2.5 font-mono text-[11px]">
      {entries.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="min-w-0 break-words">
            {Array.isArray(value) ? (
              <ul className="flex flex-col gap-0.5">
                {value.map((v, i) => (
                  <li key={i}>
                    <PrimitiveValue value={v} />
                  </li>
                ))}
              </ul>
            ) : value && typeof value === "object" ? (
              <span className="text-foreground">{JSON.stringify(value)}</span>
            ) : (
              <PrimitiveValue value={value} />
            )}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

function MessageRow({
  message,
  isNew,
  onAction,
  now,
}: {
  message: AgentMessageVM
  isNew: boolean
  onAction?: (m: AgentMessageVM) => void
  now: number
}) {
  const agent = AGENTS[message.agent]
  const typeMeta = MESSAGE_TYPES[message.type]
  const TypeIcon = typeMeta.icon
  const phase = PHASES[PHASE_INDEX[message.phase]]
  const target = message.targetAgent ? AGENTS[message.targetAgent] : null
  const hasFile = typeof message.payload?.file === "string"
  const content =
    typeof message.payload?.content === "string"
      ? message.payload.content.trim()
      : ""
  const isArtifact = message.type === "artifact_created"
  const hasDetails =
    message.payload &&
    Object.keys(message.payload).some(
      (k) => k !== "file" && k !== "artifact" && k !== "content"
    )
  const actionLabel =
    message.phase === "db_migration" ? "Review DB plan" : "View blocker"

  return (
    <li className={cn("flex items-stretch gap-3", isNew && "stream-in")}>
      <div className="flex flex-col items-center pt-0.5">
        <span
          data-feed-glyph
          data-agent={message.agent}
          className="inline-flex"
        >
          <AgentGlyph agent={message.agent} size="md" active={isNew} />
        </span>
        <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-medium" style={{ color: agent.color }}>
            {agent.name}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium",
              TYPE_TONE[typeMeta.tone]
            )}
          >
            <TypeIcon className="size-3.5" />
            {typeMeta.label}
          </span>
          {target && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <IconChevronRight className="size-3" />
              <span style={{ color: target.color }}>{target.name}</span>
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/70">
            {phase.label}
          </span>
          <span className="ml-auto flex items-center gap-2.5">
            <time
              className="text-[11px] text-muted-foreground/70"
              dateTime={message.createdAt}
            >
              {relativeTime(message.createdAt, now)}
            </time>
          </span>
        </div>

        {(!content || isArtifact) && (
          <p className="mt-1 font-mono text-[12.5px] leading-snug text-foreground/90">
            {message.summary}
          </p>
        )}

        {hasFile && (
          <span className="mt-2 inline-flex items-center gap-1.5 border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            <IconFile className="size-3" />
            {String(message.payload!.file)}
          </span>
        )}

        {message.requiresAction && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-warning/35 bg-warning/10 px-2.5 py-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
              <IconAlertTriangle className="size-3.5" />
              Needs your decision
            </span>
            {onAction && (
              <Button
                size="xs"
                variant="outline"
                className="border-warning/40 text-warning hover:bg-warning/15 hover:text-warning"
                onClick={() => onAction(message)}
              >
                {actionLabel}
              </Button>
            )}
          </div>
        )}

        {content && (
          <div className="mt-2 max-h-72 overflow-y-auto border border-border/70 bg-muted/20 p-2.5">
            {isArtifact ? (
              <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-foreground/85">
                <code>{content}</code>
              </pre>
            ) : (
              <Markdown content={content} />
            )}
          </div>
        )}

        {hasDetails && (
          <Collapsible className="mt-1.5">
            <CollapsibleTrigger className="group/details inline-flex items-center gap-1 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground">
              <IconChevronRight className="size-3 transition-transform group-data-[state=open]/details:rotate-90" />
              Details
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5">
              <PayloadView payload={message.payload!} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </li>
  )
}

export function BandFeed({
  run,
  messages,
  streamedIds,
  selectedAgent,
  selectedPhase,
  onClearFilters,
  onAction,
  now,
  className,
  showHeader = true,
}: {
  run: Run
  messages: AgentMessageVM[]
  streamedIds: Set<string>
  selectedAgent?: AgentKey | null
  selectedPhase?: PhaseKey | null
  onClearFilters?: () => void
  onAction?: (m: AgentMessageVM) => void
  now: number
  className?: string
  showHeader?: boolean
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = React.useState(true)
  const [newCount, setNewCount] = React.useState(0)
  const prevLen = React.useRef(messages.length)

  const filtered = React.useMemo(
    () =>
      messages.filter(
        (m) =>
          (!selectedAgent || m.agent === selectedAgent) &&
          (!selectedPhase || m.phase === selectedPhase)
      ),
    [messages, selectedAgent, selectedPhase]
  )
  const hasFilter = Boolean(selectedAgent || selectedPhase)

  const checkBottom = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const bottom = distance < 48
    setAtBottom(bottom)
    if (bottom) setNewCount(0)
  }, [])

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current
      if (!el) return
      el.scrollTo({ top: el.scrollHeight, behavior })
      setNewCount(0)
    },
    []
  )

  React.useLayoutEffect(() => {
    if (messages.length > prevLen.current) {
      if (atBottom && !hasFilter) scrollToBottom("smooth")
      else setNewCount((n) => n + (messages.length - prevLen.current))
    }
    prevLen.current = messages.length
  }, [messages.length, atBottom, hasFilter, scrollToBottom])

  React.useEffect(() => {
    scrollToBottom("auto")
  }, [run.id, scrollToBottom])

  return (
    <section
      className={cn("relative flex min-h-0 flex-col", className)}
      aria-label="Band room feed"
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-xs font-semibold text-muted-foreground uppercase">
              Band room <span>{run.bandRoomName}</span>
            </h2>
          </div>
          {hasFilter ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 text-[11px] text-signal outline-none hover:underline focus-visible:underline"
            >
              <IconX className="size-3" />
              Clear filter
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {filtered.length} messages
            </span>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={checkBottom}
        className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        {isLive(run.status) && filtered.length > 1 && (
          <BandChatter scrollRef={scrollRef} enabled />
        )}
        {filtered.length === 0 ? (
          hasFilter ? (
            <p className="px-1 py-8 text-center text-xs text-muted-foreground">
              No messages match this filter.
            </p>
          ) : run.status === "pending" ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span
                className="dot-pulse size-2 rounded-full bg-signal"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">Assembling the band</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Agents are registering for this run. The first messages land as
                soon as the Router posts the plan.
              </p>
            </div>
          ) : (
            <p className="px-1 py-8 text-center text-xs text-muted-foreground">
              No messages yet.
            </p>
          )
        ) : (
          <ol className="flex flex-col">
            {filtered.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                isNew={streamedIds.has(m.id)}
                onAction={onAction}
                now={now}
              />
            ))}
          </ol>
        )}
      </div>

      {newCount > 0 && !atBottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            size="sm"
            onClick={() => scrollToBottom("smooth")}
            className="pointer-events-auto gap-1.5 bg-signal text-signal-foreground shadow-md hover:bg-signal/90"
          >
            <IconArrowDown className="size-3.5" />
            {newCount} new
          </Button>
        </div>
      )}
    </section>
  )
}
