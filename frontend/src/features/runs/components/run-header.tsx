import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  IconChevronLeft,
  IconCircleCheck,
  IconClock,
  IconGitBranch,
  IconGitCommit,
  IconPlayerPlay,
  IconRefresh,
} from "@tabler/icons-react"

import { canCancel as canCancelRole, isLive } from "@/lib/domain"
import type { PhaseKey, Role } from "@/lib/domain"
import { clock, elapsed, shortSha } from "@/lib/format"
import type { Run } from "@/lib/types"
import { cn } from "@/lib/utils"
import { startRun, cancelRun, rerunRun } from "@/lib/api"
import { useAuth } from "@/providers/auth-provider"
import { LangRoute } from "@/features/migrations/components/lang-route"
import { StatusBadge } from "@/features/migrations/components/status-badge"
import { PhasePipeline } from "@/features/runs/components/phase-pipeline"
import { Button } from "@/components/ui/button"

const ACTION_BUTTON_CLASS = "h-8 min-w-28 justify-center px-3 text-sm"

function RunningDots() {
  return (
    <span
      className="running-dots ml-0.5 inline-flex w-4 justify-start"
      aria-hidden="true"
    >
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  )
}

function RunActionButton({ run, role }: { run: Run; role: Role }) {
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const live = isLive(run.status)
  const [stopToastId, setStopToastId] = React.useState<string | number | null>(
    null
  )

  React.useEffect(() => {
    if (!live && stopToastId !== null) {
      toast.dismiss(stopToastId)
      setStopToastId(null)
    }
  }, [live, stopToastId])

  const startMutation = useMutation({
    mutationFn: () => startRun(accessToken ?? "", run.id),
    onSuccess: () => {
      toast.success("Run started", {
        description: "Agents are assembling for this migration.",
      })
      queryClient.invalidateQueries({ queryKey: ["run", run.id] })
    },
    onError: () => toast.error("Failed to start run"),
  })

  const rerunMutation = useMutation({
    mutationFn: () => rerunRun(accessToken ?? "", run.id),
    onSuccess: (result) => {
      toast.success("Run restarted", {
        description: `Run #${result.runNumber} created.`,
      })
      queryClient.invalidateQueries({ queryKey: ["recent-runs"] })
      navigate(`/runs/${result.id}`)
    },
    onError: () => toast.error("Failed to rerun"),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelRun(accessToken ?? "", run.id),
    onSuccess: () => {
      toast.success("Run cancelled")
      setStopToastId(null)
      queryClient.invalidateQueries({ queryKey: ["run", run.id] })
    },
    onError: () => {
      setStopToastId(null)
      toast.error("Failed to cancel run")
    },
  })
  const isStopPending = stopToastId !== null || cancelMutation.isPending

  function requestStopRun() {
    if (isStopPending) return

    if (!canCancelRole(role)) {
      toast.error("You cannot stop this run", {
        description: "Only owners, admins, and engineers can terminate a run.",
      })
      return
    }

    let toastId: string | number
    toastId = toast("Stop this run?", {
      description: "The band will stop after the current step.",
      duration: Infinity,
      action: {
        label: "Stop run",
        onClick: () => {
          toast.dismiss(toastId)
          setStopToastId(null)
          cancelMutation.mutate()
        },
      },
      cancel: {
        label: "Keep running",
        onClick: () => {
          toast.dismiss(toastId)
          setStopToastId(null)
        },
      },
      onDismiss: () => setStopToastId(null),
      onAutoClose: () => setStopToastId(null),
    })

    setStopToastId(toastId)
  }

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

  if (live) {
    return (
      <Button
        size="sm"
        disabled={cancelMutation.isPending}
        className={cn(
          ACTION_BUTTON_CLASS,
          isStopPending
            ? "border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "border-warning/45 bg-warning/15 text-warning hover:bg-warning/20"
        )}
        onClick={requestStopRun}
      >
        {isStopPending ? (
          <>
            <span
              className="dot-pulse size-2 rounded-[2px] bg-destructive"
              aria-hidden="true"
            />
            Stopping
            <RunningDots />
          </>
        ) : (
          <>
            <span
              className="dot-pulse size-2 rounded-[2px] bg-warning"
              aria-hidden="true"
            />
            Running
            <RunningDots />
          </>
        )}
      </Button>
    )
  }

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
      <IconPlayerPlay data-icon="inline-start" />
      Run
    </Button>
  )
}

export function RunHeader({
  run,
  role,
  now,
  selectedPhase,
  onSelectPhase,
  className,
}: {
  run: Run
  role: Role
  now: number
  dbApproved?: boolean
  selectedPhase?: PhaseKey | null
  onSelectPhase?: (phase: PhaseKey | null) => void
  className?: string
}) {
  const live = isLive(run.status)
  const timer = live
    ? clock(run.startedAt, undefined, now)
    : elapsed(run.startedAt, run.completedAt, now)

  return (
    <header className={cn("border-b border-border bg-background", className)}>
      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
        <Button
          asChild
          size="icon-sm"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          aria-label="Back to runs"
        >
          <Link to="/">
            <IconChevronLeft />
          </Link>
        </Button>

        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold text-foreground">
            {run.project.name}
          </h1>
          <span className="tabular text-sm text-muted-foreground/65">
            #{run.runNumber}
          </span>
          <StatusBadge status={run.status} className="h-5 px-1.5 text-[11px]" />
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

        <div className="ml-auto flex items-center gap-3">
          <PhasePipeline
            run={run}
            selected={selectedPhase}
            onSelect={onSelectPhase}
            density="compact"
          />
          <RunActionButton run={run} role={role} />
        </div>
      </div>
    </header>
  )
}
