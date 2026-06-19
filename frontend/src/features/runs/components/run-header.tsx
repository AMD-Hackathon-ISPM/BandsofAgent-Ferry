import { useNavigate } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  IconCircleCheck,
  IconClock,
  IconGitBranch,
  IconGitCommit,
  IconHourglass,
  IconPlayerPlay,
  IconRefresh,
} from "@tabler/icons-react"

import { isLive } from "@/lib/domain"
import { clock, elapsed, shortSha } from "@/lib/format"
import type { Run } from "@/lib/types"
import { cn } from "@/lib/utils"
import { rerunRun, startRun } from "@/lib/api"
import { useAuth } from "@/providers/auth-provider"
import { LangRoute } from "@/features/migrations/components/lang-route"
import { StatusBadge } from "@/features/migrations/components/status-badge"
import { Button } from "@/components/ui/button"

const ACTION_BUTTON_CLASS = "h-8 min-w-28 justify-center px-3 text-sm"

function QueueInfoButton({ run }: { run: Run }) {
  if (run.status !== "pending") return null

  return (
    <Button
      size="icon-sm"
      variant="outline"
      className="size-6 shrink-0 border-primary/35 bg-primary/10 text-primary hover:bg-primary/15"
      aria-label="Queue information"
      onClick={() =>
        toast("Run is queued", {
          description:
            "Ferry will send this run to the band as soon as capacity is available.",
        })
      }
    >
      <IconHourglass />
    </Button>
  )
}

export function RunNavActions({ run }: { run: Run }) {
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const live = isLive(run.status)

  const startMutation = useMutation({
    mutationFn: () => startRun(accessToken ?? "", run.id),
    onSuccess: () => {
      toast.success("Run queued", {
        description:
          "Ferry will dispatch the band when capacity is available. Use the queue info button for status context.",
      })
      queryClient.invalidateQueries({ queryKey: ["run", run.id] })
    },
    onError: () => toast.error("Failed to start run"),
  })

  const rerunMutation = useMutation({
    mutationFn: () => rerunRun(accessToken ?? "", run.id),
    onSuccess: (result) => {
      toast.success("New voyage session created", {
        description: `Run #${result.runNumber} starts as a separate rerun.`,
      })
      queryClient.invalidateQueries({ queryKey: ["recent-runs"] })
      navigate(`/runs/${result.id}`)
    },
    onError: () => toast.error("Failed to rerun"),
  })

  if (run.status === "completed") {
    return (
      <Button
        size="sm"
        className={cn(
          ACTION_BUTTON_CLASS,
          "border-success/40 bg-success/15 text-success hover:bg-success/20"
        )}
        onClick={() =>
          toast.success("Migration succeeded", {
            description: run.pr
              ? `Pull request #${run.pr.number} is ready.`
              : "All stages are complete.",
          })
        }
      >
        <IconCircleCheck data-icon="inline-start" />
        Success
      </Button>
    )
  }

  if (
    run.status === "failed" ||
    run.status === "blocked" ||
    run.status === "needs_rework"
  ) {
    return (
      <Button
        size="sm"
        disabled={rerunMutation.isPending}
        className={cn(
          ACTION_BUTTON_CLASS,
          "border-warning/45 bg-warning/15 text-warning hover:bg-warning/25"
        )}
        onClick={() => rerunMutation.mutate()}
      >
        <IconRefresh data-icon="inline-start" />
        Re run
      </Button>
    )
  }

  if (live) return null

  return (
    <Button
      size="sm"
      disabled={startMutation.isPending}
      className={cn(
        ACTION_BUTTON_CLASS,
        "border-primary/45 bg-primary text-primary-foreground hover:bg-primary/85"
      )}
      onClick={() => startMutation.mutate()}
    >
      {startMutation.isPending ? (
        <>
          <IconHourglass data-icon="inline-start" />
          Queueing
        </>
      ) : (
        <>
          <IconPlayerPlay data-icon="inline-start" />
          Run
        </>
      )}
    </Button>
  )
}

export function RunNavInfo({
  run,
  now,
  className,
}: {
  run: Run
  now: number
  className?: string
}) {
  const live = isLive(run.status)
  const timer = live
    ? clock(run.startedAt, undefined, now)
    : elapsed(run.startedAt, run.completedAt, now)

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="max-w-[34vw] truncate text-[15px] font-semibold text-foreground sm:max-w-[28rem]">
          {run.project.name}
        </h1>
        <span className="tabular shrink-0 text-sm text-muted-foreground/65">
          #{run.runNumber}
        </span>
        <StatusBadge status={run.status} className="h-5 px-1.5 text-[11px]" />
        <QueueInfoButton run={run} />
      </div>

      <div className="hidden items-center gap-x-3.5 text-xs text-muted-foreground lg:flex">
        <LangRoute
          source={run.project.sourceLanguage}
          target={run.project.targetLanguage}
          className="text-xs"
        />
        <span className="inline-flex items-center gap-1 font-mono">
          <IconGitCommit className="size-3.5" />
          <span className="tabular">{shortSha(run.sourceCommit)}</span>
        </span>
        <span className="hidden min-w-0 items-center gap-1 font-mono 2xl:inline-flex">
          <IconGitBranch className="size-3.5 shrink-0" />
          <span className="max-w-44 truncate">{run.targetBranch}</span>
        </span>
        {run.startedAt && (
          <span className="inline-flex items-center gap-1 font-mono">
            <IconClock className="size-3.5" />
            <span className="tabular" aria-live={live ? "off" : undefined}>
              {timer}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
