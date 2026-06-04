import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { IconChevronRight, IconHistory } from "@tabler/icons-react"

import { fetchRecentRuns } from "@/lib/api"
import { relativeTime } from "@/lib/format"
import { useNow } from "@/lib/hooks"
import type { RecentRunSummary } from "@/lib/types"
import { LangRoute } from "@/features/migrations/components/lang-route"
import { StatusBadge } from "@/features/migrations/components/status-badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

function RunRow({ run, now }: { run: RecentRunSummary; now: number }) {
  return (
    <Link
      to={`/runs/${run.id}`}
      className="group/row flex items-center gap-3 border border-border bg-card px-3 py-2.5 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring"
    >
      <StatusBadge status={run.status} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">{run.projectName}</span>
          <span className="tabular text-[11px] text-muted-foreground">Run #{run.runNumber}</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          <LangRoute source={run.sourceLanguage} target={run.targetLanguage} />
          <span className="tabular">{run.messageCount} messages</span>
        </div>
      </div>
      <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={run.updatedAt}>
        {relativeTime(run.updatedAt, now)}
      </time>
      <IconChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover/row:text-muted-foreground" />
    </Link>
  )
}

export function RecentRuns() {
  const now = useNow(30_000)
  const { data, isPending } = useQuery({
    queryKey: ["recent-runs"],
    queryFn: fetchRecentRuns,
  })

  return (
    <section aria-label="Recent runs">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Recent runs</h2>
        {data && <span className="text-[11px] text-muted-foreground">{data.length}</span>}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[58px] w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Empty className="border border-dashed border-border py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconHistory />
            </EmptyMedia>
            <EmptyTitle>No runs yet</EmptyTitle>
            <EmptyDescription>Point Ferry at a repository to start one.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((run) => (
            <RunRow key={run.id} run={run} now={now} />
          ))}
        </div>
      )}
    </section>
  )
}
