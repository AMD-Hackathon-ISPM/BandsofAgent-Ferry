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
  IconX,
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

function RunActionButton({ run }: { run: Run }) {
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const live = isLive(run.status)

  const startMutation = useMutation({
    mutationFn: () => startRun(accessToken ?? "", run.id),
    onSuccess: () => {
      toast.success("Run started", { description: "Agents are assembling for this migration." })
      queryClient.invalidateQueries({ queryKey: ["run", run.id] })
    },
    onError: () => toast.error("Failed to start run"),
  })

  const rerunMutation = useMutation({
    mutationFn: () => rerunRun(accessToken ?? "", run.id),
    onSuccess: (result) => {
      toast.success("Run restarted", { description: `Run #${result.runNumber} created.` })
      queryClient.invalidateQueries({ queryKey: ["recent-runs"] })
      navigate(`/runs/${result.id}`)
    },
    onError: () => toast.error("Failed to rerun"),
  })

  if (run.status === "completed") {
    return (
      <Button
        size="lg"
        className="h-12 border-success/40 bg-success/15 px-5 text-base text-success hover:bg-success/20"
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
        size="lg"
        disabled={rerunMutation.isPending}
        className="h-12 border-warning/45 bg-warning/15 px-5 text-base text-warning hover:bg-warning/25"
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
        size="lg"
        className="h-12 border-warning/45 bg-warning/15 px-5 text-base text-warning hover:bg-warning/20"
        onClick={() =>
          toast("Run already in progress", {
            description: "Agents are still working through the current stage.",
          })
        }
      >
        <span
          className="dot-pulse size-3 rounded-[3px] bg-warning"
          aria-hidden="true"
        />
        Running
        <RunningDots />
      </Button>
    )
  }

  return (
    <Button
      size="lg"
      disabled={startMutation.isPending}
      className="h-12 border-primary/45 bg-primary px-5 text-base text-primary-foreground hover:bg-primary/85"
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
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const live = isLive(run.status)
  const showCancel = live && canCancelRole(role)
  const timer = live
    ? clock(run.startedAt, undefined, now)
    : elapsed(run.startedAt, run.completedAt, now)

  const cancelMutation = useMutation({
    mutationFn: () => cancelRun(accessToken ?? "", run.id),
    onSuccess: () => {
      toast.success("Run cancelled")
      queryClient.invalidateQueries({ queryKey: ["run", run.id] })
    },
    onError: () => toast.error("Failed to cancel run"),
  })

  return (
    <header className={cn("border-b border-border bg-background", className)}>
      <div className="flex min-h-36 flex-col gap-8 px-5 py-7 sm:px-8">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 gap-4">
            <Button
              asChild
              size="icon-sm"
              variant="ghost"
              className="mt-1 shrink-0 text-muted-foreground"
              aria-label="Back to runs"
            >
              <Link to="/">
                <IconChevronLeft />
              </Link>
            </Button>

            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <h1 className="truncate text-2xl font-semibold text-foreground">
                  {run.project.name}
                </h1>
                <span className="tabular text-2xl text-muted-foreground/65">
                  Run #{run.runNumber}
                </span>
                <StatusBadge status={run.status} className="h-7 px-2 text-sm" />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
                <LangRoute
                  source={run.project.sourceLanguage}
                  target={run.project.targetLanguage}
                  className="text-[13px]"
                />
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <IconGitCommit className="size-4" />
                  <span className="tabular">{shortSha(run.sourceCommit)}</span>
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5 font-mono">
                  <IconGitBranch className="size-4 shrink-0" />
                  <span className="max-w-56 truncate">{run.targetBranch}</span>
                </span>
                {run.startedAt && (
                  <span className="inline-flex items-center gap-1.5 font-mono">
                    <IconClock className="size-4" />
                    <span
                      className="tabular"
                      aria-live={live ? "off" : undefined}
                    >
                      {timer}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {showCancel && (
              <Button
                size="icon-lg"
                variant="outline"
                disabled={cancelMutation.isPending}
                className="size-12 border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                aria-label="Cancel run"
                onClick={() =>
                  toast("Cancel this run?", {
                    description: "The band will stop after the current step.",
                    action: {
                      label: "Cancel run",
                      onClick: () => cancelMutation.mutate(),
                    },
                  })
                }
              >
                <IconX className="size-6" />
              </Button>
            )}
            <RunActionButton run={run} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-2 pb-2">
          <PhasePipeline
            run={run}
            selected={selectedPhase}
            onSelect={onSelectPhase}
          />
        </div>
      </div>
    </header>
  )
}
