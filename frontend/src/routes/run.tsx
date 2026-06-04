import * as React from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { IconAlertTriangle, IconArrowLeft, IconReload } from "@tabler/icons-react"

import { canApprove } from "@/lib/domain"
import type { AgentKey, PhaseKey } from "@/lib/domain"
import { fetchRun } from "@/lib/api"
import { useLiveRun, useNow } from "@/lib/hooks"
import { useAuth } from "@/providers/auth-provider"
import { AgentRoster } from "@/features/runs/components/agent-roster"
import { BandFeed } from "@/features/runs/components/band-feed"
import { OutputsPanel } from "@/features/runs/components/outputs-panel"
import { PhasePipeline } from "@/features/runs/components/phase-pipeline"
import { RunHeader } from "@/features/runs/components/run-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function RunSkeleton() {
  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="mt-2 h-3 w-80" />
      </div>
      <div className="border-b border-border px-4 py-4">
        <Skeleton className="h-7 w-full max-w-2xl" />
      </div>
      <div className="grid flex-1 grid-cols-1 xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
        <div className="hidden flex-col gap-3 border-r border-border p-3 xl:flex">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-4 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
        <div className="hidden flex-col gap-3 border-l border-border p-3 xl:flex">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </div>
  )
}

function RunNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-medium">This run could not be found.</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          It may have been removed, or the link is wrong. Head back to your runs.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/">
            <IconArrowLeft data-icon="inline-start" />
            Back to runs
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function RunView() {
  const { runId = "" } = useParams()
  const { user } = useAuth()
  const now = useNow(1000)
  const [selectedAgent, setSelectedAgent] = React.useState<AgentKey | null>(null)
  const [selectedPhase, setSelectedPhase] = React.useState<PhaseKey | null>(null)
  const [pane, setPane] = React.useState("feed")

  const { data: run, isPending, isError } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => fetchRun(runId),
  })

  if (isPending) return <RunSkeleton />
  if (isError || !run) return <RunNotFound />

  return <RunReady key={run.id} run={run} role={user!.role} now={now} {...{ selectedAgent, setSelectedAgent, selectedPhase, setSelectedPhase, pane, setPane }} />
}

function RunReady({
  run,
  role,
  now,
  selectedAgent,
  setSelectedAgent,
  selectedPhase,
  setSelectedPhase,
  pane,
  setPane,
}: {
  run: import("@/lib/types").Run
  role: import("@/lib/domain").Role
  now: number
  selectedAgent: AgentKey | null
  setSelectedAgent: (a: AgentKey | null) => void
  selectedPhase: PhaseKey | null
  setSelectedPhase: (p: PhaseKey | null) => void
  pane: string
  setPane: (p: string) => void
}) {
  const { messages, agents, streamedIds } = useLiveRun(run)
  const liveRun = { ...run, agents, messages }
  const userCanApprove = canApprove(role)
  const [dbApproved, setDbApproved] = React.useState(Boolean(run.dbPlan?.approvedBy))

  const handleAction = React.useCallback(() => {
    setPane("outputs")
    requestAnimationFrame(() => {
      document.getElementById("db-plan")?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }, [setPane])

  const clearFilters = () => {
    setSelectedAgent(null)
    setSelectedPhase(null)
  }

  const roster = (
    <AgentRoster
      run={liveRun}
      selected={selectedAgent}
      onSelect={setSelectedAgent}
      now={now}
      className="h-full overflow-y-auto"
    />
  )
  const feed = (
    <BandFeed
      run={liveRun}
      messages={messages}
      streamedIds={streamedIds}
      selectedAgent={selectedAgent}
      selectedPhase={selectedPhase}
      onClearFilters={clearFilters}
      onAction={handleAction}
      now={now}
      className="h-full"
    />
  )
  const outputs = (
    <OutputsPanel
      run={liveRun}
      canApprove={userCanApprove}
      dbApproved={dbApproved}
      onApproveDbPlan={() => setDbApproved(true)}
      className="h-full"
    />
  )

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-hidden">
      <RunHeader run={liveRun} role={role} now={now} dbApproved={dbApproved} />

      <div className="border-b border-border bg-background px-4 py-3">
        <PhasePipeline run={liveRun} selected={selectedPhase} onSelect={setSelectedPhase} />
      </div>

      <RunBanner run={liveRun} onAction={handleAction} />

      <div className="hidden min-h-0 flex-1 xl:grid xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
        <div className="min-h-0 border-r border-border">{roster}</div>
        <div className="min-h-0 border-r border-border">{feed}</div>
        <div className="min-h-0">{outputs}</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col xl:hidden">
        <Tabs value={pane} onValueChange={setPane} className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="m-2 self-start">
            <TabsTrigger value="feed">Band room</TabsTrigger>
            <TabsTrigger value="band">The band</TabsTrigger>
            <TabsTrigger value="outputs">Outputs</TabsTrigger>
          </TabsList>
          <TabsContent value="feed" className="min-h-0 flex-1 border-t border-border">
            {feed}
          </TabsContent>
          <TabsContent value="band" className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {roster}
          </TabsContent>
          <TabsContent value="outputs" className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {outputs}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function RunBanner({
  run,
  onAction,
}: {
  run: import("@/lib/types").Run
  onAction: () => void
}) {
  if (run.status === "failed") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5">
        <p className="flex items-start gap-2 text-xs text-destructive">
          <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="font-semibold">Run failed.</span>{" "}
            <span className="text-destructive/90">{run.errorMessage}</span>
          </span>
        </p>
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/15 hover:text-destructive"
          onClick={() => toast("Retrying run", { description: "A new run starts from the last good commit." })}
        >
          <IconReload data-icon="inline-start" />
          Retry run
        </Button>
      </div>
    )
  }
  if (run.status === "blocked" || run.status === "needs_rework") {
    const blocker = [...run.messages].reverse().find((m) => m.requiresAction)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2.5">
        <p className="flex items-start gap-2 text-xs text-warning">
          <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="font-semibold">
              {run.status === "blocked" ? "Run blocked." : "Needs rework."}
            </span>{" "}
            <span className="text-warning/90">{blocker?.summary ?? "Waiting on a human decision."}</span>
          </span>
        </p>
        <Button
          size="sm"
          variant="outline"
          className="border-warning/40 text-warning hover:bg-warning/15 hover:text-warning"
          onClick={onAction}
        >
          Review
        </Button>
      </div>
    )
  }
  return null
}

export default RunView
