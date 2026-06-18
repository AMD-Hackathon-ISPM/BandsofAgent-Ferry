import * as React from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  IconChevronLeft,
  IconChevronRight,
  IconHistory,
} from "@tabler/icons-react"

import { fetchRecentRuns } from "@/lib/api"
import { relativeTime } from "@/lib/format"
import { useNow } from "@/lib/hooks"
import type { RecentRunSummary } from "@/lib/types"
import { LangRoute } from "@/features/migrations/components/lang-route"
import { StatusBadge } from "@/features/migrations/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

const PAGE_SIZE = 5

function RunRow({ run, now }: { run: RecentRunSummary; now: number }) {
  return (
    <Link
      to={`/runs/${run.id}`}
      className="group/row flex items-center gap-3 border border-border bg-card px-3 py-2.5 transition-colors outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring"
    >
      <StatusBadge status={run.status} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">
            {run.projectName}
          </span>
          <span className="tabular text-[11px] text-muted-foreground">
            Run #{run.runNumber}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          <LangRoute source={run.sourceLanguage} target={run.targetLanguage} />
          <span
            className="tabular"
            title="Agent updates recorded for this run"
            aria-label={`${run.messageCount} agent updates recorded for this run`}
          >
            {run.messageCount} agent updates
          </span>
        </div>
      </div>
      <time
        className="shrink-0 text-[11px] text-muted-foreground"
        dateTime={run.updatedAt}
      >
        {relativeTime(run.updatedAt, now)}
      </time>
      <IconChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover/row:text-muted-foreground" />
    </Link>
  )
}

export function RecentRuns() {
  const now = useNow(30_000)
  const [page, setPage] = React.useState(0)
  const { data, isPending } = useQuery({
    queryKey: ["recent-runs"],
    queryFn: fetchRecentRuns,
  })
  const runs = data ?? []
  const totalPages = Math.max(1, Math.ceil(runs.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageStart = currentPage * PAGE_SIZE
  const pageRuns = runs.slice(pageStart, pageStart + PAGE_SIZE)
  const pageEnd = pageStart + pageRuns.length

  return (
    <section aria-label="Recent runs">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Recent runs</h2>
        {data && (
          <span className="text-[11px] text-muted-foreground">
            {data.length} runs
          </span>
        )}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <Skeleton key={i} className="h-[58px] w-full" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <Empty className="border border-dashed border-border py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconHistory />
            </EmptyMedia>
            <EmptyTitle>No runs yet</EmptyTitle>
            <EmptyDescription>
              Point Ferry at a repository to start one.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div key={currentPage} className="stream-in flex flex-col gap-2">
            {pageRuns.map((run) => (
              <RunRow key={run.id} run={run} now={now} />
            ))}
          </div>

          {runs.length > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="tabular text-[11px] text-muted-foreground">
                {pageStart + 1}-{pageEnd} of {runs.length}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Previous recent runs page"
                  disabled={currentPage === 0}
                  onClick={() => setPage(Math.max(0, currentPage - 1))}
                >
                  <IconChevronLeft />
                </Button>
                <span className="tabular min-w-16 text-center text-[11px] text-muted-foreground">
                  {currentPage + 1} / {totalPages}
                </span>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Next recent runs page"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() =>
                    setPage(Math.min(totalPages - 1, currentPage + 1))
                  }
                >
                  <IconChevronRight />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
