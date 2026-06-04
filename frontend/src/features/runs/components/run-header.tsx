import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  IconChevronLeft,
  IconClock,
  IconExternalLink,
  IconGitBranch,
  IconGitCommit,
  IconReload,
} from "@tabler/icons-react"

import { canApprove as canApproveRole, canCancel as canCancelRole, isLive } from "@/lib/domain"
import { clock, elapsed, relativeTime, shortSha } from "@/lib/format"
import type { Run } from "@/lib/types"
import type { Role } from "@/lib/domain"
import { cn } from "@/lib/utils"
import { LangRoute } from "@/features/migrations/components/lang-route"
import { StatusBadge } from "@/features/migrations/components/status-badge"
import { Button } from "@/components/ui/button"

function scrollToDbPlan() {
  const el = document.getElementById("db-plan")
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
}

export function RunHeader({
  run,
  role,
  now,
  dbApproved = false,
  className,
}: {
  run: Run
  role: Role
  now: number
  dbApproved?: boolean
  className?: string
}) {
  const live = isLive(run.status)
  const dbPending = Boolean(run.dbPlan) && !dbApproved
  const timer = live ? clock(run.startedAt, undefined, now) : elapsed(run.startedAt, run.completedAt, now)

  return (
    <header className={cn("border-b border-border bg-background", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild size="icon-sm" variant="ghost" className="text-muted-foreground" aria-label="Back to runs">
            <Link to="/">
              <IconChevronLeft />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold">{run.project.name}</h1>
              <span className="tabular text-xs text-muted-foreground">Run #{run.runNumber}</span>
              <StatusBadge status={run.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <LangRoute source={run.project.sourceLanguage} target={run.project.targetLanguage} />
              <span className="inline-flex items-center gap-1">
                <IconGitCommit className="size-3" />
                <span className="tabular">{shortSha(run.sourceCommit)}</span>
                <IconChevronLeft className="size-3 rotate-180" />
                <IconGitBranch className="size-3" />
                {run.targetBranch}
              </span>
              {run.startedAt && (
                <span className="inline-flex items-center gap-1">
                  <IconClock className="size-3" />
                  <span className="tabular" aria-live={live ? "off" : undefined}>
                    {timer}
                  </span>
                  {!live && <span className="text-muted-foreground/60">· {relativeTime(run.startedAt, now)}</span>}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dbPending && canApproveRole(role) && (
            <Button size="sm" onClick={scrollToDbPlan} className="bg-warning text-warning-foreground hover:bg-warning/90">
              Review DB plan
            </Button>
          )}
          {run.status === "completed" && run.pr && (
            <Button asChild size="sm" variant="outline">
              <a href={run.pr.url} target="_blank" rel="noreferrer">
                <IconExternalLink data-icon="inline-start" />
                Open PR #{run.pr.number}
              </a>
            </Button>
          )}
          {run.status === "failed" && (
            <Button size="sm" variant="outline" onClick={() => toast("Retrying run", { description: "A new run will start from the last good commit." })}>
              <IconReload data-icon="inline-start" />
              Retry run
            </Button>
          )}
          {live && canCancelRole(role) && !dbPending && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() =>
                toast("Cancel this run?", {
                  description: "The band will stop after the current step.",
                  action: { label: "Cancel run", onClick: () => toast.success("Run cancelled") },
                })
              }
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
