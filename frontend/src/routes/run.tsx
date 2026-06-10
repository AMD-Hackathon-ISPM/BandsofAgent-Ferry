import * as React from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconMessages,
  IconReload,
  IconShip,
} from "@tabler/icons-react"

import { canApprove } from "@/lib/domain"
import type { AgentKey, PhaseKey } from "@/lib/domain"
import { fetchRun } from "@/lib/api"
import { useLiveRun, useMediaQuery, useNow } from "@/lib/hooks"
import { useAuth } from "@/providers/auth-provider"
import { cn } from "@/lib/utils"
import { AgentRoster } from "@/features/runs/components/agent-roster"
import { BandFeed } from "@/features/runs/components/band-feed"
import { OutputsPanel } from "@/features/runs/components/outputs-panel"
import { RunHeader } from "@/features/runs/components/run-header"
import { VoyageView } from "@/features/voyage/voyage-view"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function RunSkeleton() {
  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-7 shrink-0" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="mt-3 flex items-center gap-3 pb-2.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-1 items-center gap-3 last:flex-none"
            >
              <Skeleton className="size-7 shrink-0" />
              {i < 6 && <span className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>
      </div>
      <div className="grid flex-1 grid-cols-1 xl:grid-cols-[20rem_minmax(0,1fr)_30rem]">
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
          It may have been removed, or the link is wrong. Head back to your
          runs.
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
  const [selectedAgent, setSelectedAgent] = React.useState<AgentKey | null>(
    null
  )
  const [selectedPhase, setSelectedPhase] = React.useState<PhaseKey | null>(
    null
  )
  const [pane, setPane] = React.useState("voyage")

  const {
    data: run,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => fetchRun(runId),
  })

  if (isPending) return <RunSkeleton />
  if (isError || !run) return <RunNotFound />

  return (
    <RunReady
      key={run.id}
      run={run}
      role={user!.role}
      now={now}
      {...{
        selectedAgent,
        setSelectedAgent,
        selectedPhase,
        setSelectedPhase,
        pane,
        setPane,
      }}
    />
  )
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
  const [dbApproved, setDbApproved] = React.useState(
    Boolean(run.dbPlan?.approvedBy)
  )
  const [centerView, setCenterView] = React.useState<"voyage" | "feed">(
    "voyage"
  )
  const isXL = useMediaQuery("(min-width: 1280px)")

  const handleAction = React.useCallback(() => {
    setPane("outputs")
    requestAnimationFrame(() => {
      document
        .getElementById("db-plan")
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
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
  const voyage = (
    <VoyageView
      run={liveRun}
      messages={messages}
      streamedIds={streamedIds}
      selectedAgent={selectedAgent}
      onSelectAgent={setSelectedAgent}
      logClassName={isXL ? "left-[21.5rem]" : undefined}
    />
  )

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-hidden">
      <RunHeader
        run={liveRun}
        role={role}
        now={now}
        dbApproved={dbApproved}
        selectedPhase={selectedPhase}
        onSelectPhase={setSelectedPhase}
      />

      <RunBanner run={liveRun} onAction={handleAction} />

      {isXL ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {voyage}

          <div className="absolute inset-y-3 left-3 z-10 flex w-80 flex-col overflow-hidden rounded-lg border border-border bg-card/90 shadow-lg backdrop-blur-md">
            {roster}
          </div>

          <div className="absolute inset-y-3 right-3 z-10 flex w-96 flex-col overflow-hidden rounded-lg border border-border bg-card/90 shadow-lg backdrop-blur-md">
            {outputs}
          </div>

          <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card/85 px-1.5 py-1 shadow-lg backdrop-blur-md">
            <CenterToggle
              active={centerView === "voyage"}
              onClick={() => setCenterView("voyage")}
              icon={<IconShip className="size-3.5" />}
            >
              Voyage
            </CenterToggle>
            <CenterToggle
              active={centerView === "feed"}
              onClick={() => setCenterView("feed")}
              icon={<IconMessages className="size-3.5" />}
            >
              Band room
            </CenterToggle>
            <span className="max-w-48 truncate px-1 text-[11px] text-muted-foreground">
              {run.bandRoomName}
            </span>
          </div>

          {centerView === "feed" && (
            <div className="absolute top-14 right-[25.5rem] bottom-3 left-[21.5rem] z-10 overflow-hidden rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur-md">
              <BandFeed
                run={liveRun}
                messages={messages}
                streamedIds={streamedIds}
                selectedAgent={selectedAgent}
                selectedPhase={selectedPhase}
                onClearFilters={clearFilters}
                onAction={handleAction}
                now={now}
                showHeader={false}
                className="h-full"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <Tabs
            value={pane}
            onValueChange={setPane}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <TabsList className="m-2 self-start">
              <TabsTrigger value="voyage">Voyage</TabsTrigger>
              <TabsTrigger value="feed">Band room</TabsTrigger>
              <TabsTrigger value="band">The band</TabsTrigger>
              <TabsTrigger value="outputs">Outputs</TabsTrigger>
            </TabsList>
            <TabsContent
              value="voyage"
              className="relative min-h-0 flex-1 border-t border-border"
            >
              {voyage}
            </TabsContent>
            <TabsContent
              value="feed"
              className="min-h-0 flex-1 border-t border-border"
            >
              {feed}
            </TabsContent>
            <TabsContent
              value="band"
              className="min-h-0 flex-1 overflow-y-auto border-t border-border"
            >
              {roster}
            </TabsContent>
            <TabsContent
              value="outputs"
              className="min-h-0 flex-1 overflow-y-auto border-t border-border"
            >
              {outputs}
            </TabsContent>
          </Tabs>
        </div>
      )}
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
          onClick={() =>
            toast("Retrying run", {
              description: "A new run starts from the last good commit.",
            })
          }
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
            <span className="text-warning/90">
              {blocker?.summary ?? "Waiting on a human decision."}
            </span>
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

function CenterToggle({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export default RunView
