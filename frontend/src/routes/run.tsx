import * as React from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconCode,
  IconMessages,
  IconReload,
  IconShip,
} from "@tabler/icons-react"

import { canApprove, isLive } from "@/lib/domain"
import type { AgentKey, PhaseKey } from "@/lib/domain"
import { fetchRun, startRun } from "@/lib/api"
import { useLiveRun, useMediaQuery, useNow } from "@/lib/hooks"
import { useAuth } from "@/providers/auth-provider"
import { useAppChrome } from "@/components/app-shell"
import { cn } from "@/lib/utils"
import { CrewRoster } from "@/features/voyage/crew-roster"
import { BandFeed } from "@/features/runs/components/band-feed"
import { CodeViewerBody } from "@/features/runs/components/code-viewer"
import { OutputsPanel } from "@/features/runs/components/outputs-panel"
import { ShipLog } from "@/features/voyage/ship-log"
import { RunNavActions, RunNavInfo } from "@/features/runs/components/run-header"
import { VoyageView } from "@/features/voyage/voyage-view"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function RunSkeleton() {
  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col overflow-hidden">
      <div className="grid flex-1 grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
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
          <Link to="/app">
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
    // While the run is live, poll so artifacts / PR / db-plan appear on their
    // own (messages stream over SSE; these other outputs come from the run doc).
    // Poll while live (artifacts/PR/db-plan come from the run doc) and while
    // pending/queued (so the harbor picks up when the scheduler admits the run).
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s && (isLive(s) || s === "queued" || s === "pending") ? 4000 : false
    },
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
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const { messages, agents, streamedIds } = useLiveRun(run)
  const liveRun = React.useMemo(
    () => ({ ...run, agents, messages }),
    [run, agents, messages]
  )
  const userCanApprove = canApprove(role)
  const [dbApproved, setDbApproved] = React.useState(
    Boolean(run.dbPlan?.approvedBy)
  )
  const [centerView, setCenterView] = React.useState<
    "voyage" | "feed" | "artifacts"
  >("voyage")
  const [viewedArtifactCount, setViewedArtifactCount] = React.useState(
    run.artifacts.length
  )
  const [leftOpen, setLeftOpen] = React.useState(true)
  const [rightOpen, setRightOpen] = React.useState(true)
  const isXL = useMediaQuery("(min-width: 1280px)")
  const hasNewArtifacts = run.artifacts.length > viewedArtifactCount
  const { setChrome } = useAppChrome()

  const chromeContent = React.useMemo(
    () => <RunNavInfo run={liveRun} now={now} />,
    [liveRun, now]
  )
  const chromeActions = React.useMemo(
    () => <RunNavActions run={liveRun} />,
    [liveRun]
  )

  React.useEffect(() => {
    setChrome({
      content: chromeContent,
      actions: chromeActions,
      logoLabel: "Back to runs",
      logoTo: "/app",
    })
    return () => setChrome(null)
  }, [setChrome, chromeContent, chromeActions])

  React.useEffect(() => {
    if (centerView === "artifacts" || pane === "artifacts") {
      setViewedArtifactCount(run.artifacts.length)
    }
  }, [centerView, pane, run.artifacts.length])

  const showArtifacts = React.useCallback(() => {
    setViewedArtifactCount(run.artifacts.length)
    setCenterView("artifacts")
  }, [run.artifacts.length])

  const handlePaneChange = React.useCallback(
    (value: string) => {
      if (value === "artifacts") setViewedArtifactCount(run.artifacts.length)
      setPane(value)
    },
    [run.artifacts.length, setPane]
  )

  // Full-screen loading harbor: shown on every fresh launch (or a genuinely
  // pending run) until the ferry sails out, then the control panels fade in.
  // The justLaunched flag is cleared from history on departure so a refresh
  // afterwards lands straight in the live view.
  const location = useLocation()
  const navigate = useNavigate()
  const justLaunched = Boolean(
    (location.state as { justLaunched?: boolean } | null)?.justLaunched
  )
  const [phase, setPhase] = React.useState<"loading" | "normal">(() =>
    run.status === "pending" || run.status === "queued" || justLaunched
      ? "loading"
      : "normal"
  )
  const loading = phase === "loading"
  const startedRef = React.useRef(false)
  const [startingRun, setStartingRun] = React.useState(false)
  React.useEffect(() => {
    if (!loading || run.status !== "pending" || startedRef.current) return
    startedRef.current = true
    setStartingRun(true)
    startRun(accessToken ?? "", run.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["run", run.id] }))
      .catch(() => {
        queryClient.invalidateQueries({ queryKey: ["run", run.id] })
        setPhase("normal")
        toast.error("Couldn't start the migration", {
          description: "Use the Run button to retry, or reload the page.",
        })
      })
      .finally(() => setStartingRun(false))
  }, [loading, run.status, run.id, accessToken, queryClient])

  const introMessage = loading
    ? run.status === "queued"
      ? "Waiting in queue — all run slots are busy"
      : run.status === "pending"
        ? startingRun
          ? "Dispatching the band — vehicles boarding"
          : "Queued at harbor — waiting for dispatch"
        : "Band ready — casting off"
    : undefined

  const onDeparted = React.useCallback(() => {
    setPhase("normal")
    if (justLaunched)
      navigate(location.pathname, { replace: true, state: null })
  }, [justLaunched, navigate, location.pathname])

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

  const activeAgents = liveRun.agents.filter(
    (a) => a.status === "active"
  ).length
  const roster = <CrewRoster run={liveRun} className="h-full" />
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
  const artifacts = run.artifacts.length ? (
    <CodeViewerBody artifacts={run.artifacts} />
  ) : (
    <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
      No artifacts yet. Files appear here as the band produces them.
    </div>
  )
  const voyage = (
    <VoyageView
      run={liveRun}
      messages={messages}
      streamedIds={streamedIds}
      selectedAgent={selectedAgent}
      onSelectAgent={setSelectedAgent}
      showLog={!isXL}
      intro={loading}
      introMessage={introMessage}
      onDeparted={onDeparted}
    />
  )

  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col overflow-hidden">
      <div
        className={cn(
          "shrink-0 transition-all duration-700 ease-out",
          loading
            ? "pointer-events-none max-h-0 -translate-y-4 opacity-0"
            : "max-h-64 opacity-100"
        )}
      >
        <RunBanner run={liveRun} onAction={handleAction} />
      </div>

      {isXL ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {voyage}

          <FolderPanel
            side="left"
            label="Crew"
            badge={activeAgents > 0 ? String(activeAgents) : undefined}
            open={leftOpen}
            onOpenChange={setLeftOpen}
            className={cn(
              "w-72",
              loading &&
                "pointer-events-none -translate-x-[calc(100%+0.75rem)] opacity-0"
            )}
          >
            <div className="min-h-0 flex-1 overflow-hidden">{roster}</div>
            <ShipLog messages={messages} streamedIds={streamedIds} docked />
          </FolderPanel>

          <FolderPanel
            side="right"
            label="Outputs"
            open={rightOpen}
            onOpenChange={setRightOpen}
            className={cn(
              "w-80",
              loading &&
                "pointer-events-none translate-x-[calc(100%+0.75rem)] opacity-0"
            )}
          >
            {outputs}
          </FolderPanel>

          <div
            className={cn(
              "absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card/85 px-1.5 py-1 shadow-lg backdrop-blur-md transition-opacity duration-700",
              loading && "pointer-events-none opacity-0"
            )}
          >
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
              Feed
            </CenterToggle>
            <CenterToggle
              active={centerView === "artifacts"}
              onClick={showArtifacts}
              icon={<IconCode className="size-3.5" />}
            >
              Artifacts
              {run.artifacts.length > 0 && (
                <span
                  className={cn(
                    "flex h-4 min-w-4 items-center justify-center px-1 text-[10px] tabular",
                    hasNewArtifacts
                      ? "bg-indigo-500 text-white"
                      : centerView === "artifacts"
                      ? "bg-background/80 text-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {run.artifacts.length}
                </span>
              )}
            </CenterToggle>
          </div>

          {(centerView === "feed" || centerView === "artifacts") && (
            <div
              className={cn(
                "absolute top-14 bottom-3 z-10 overflow-hidden rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur-md transition-[left,right] duration-300 ease-in-out",
                leftOpen ? "left-83" : "left-8",
                rightOpen ? "right-91" : "right-8"
              )}
            >
              {centerView === "feed" ? (
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
              ) : (
                artifacts
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <Tabs
            value={pane}
            onValueChange={handlePaneChange}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <TabsList
              className={cn(
                "m-2 self-start transition-opacity duration-700",
                loading && "pointer-events-none opacity-0"
              )}
            >
              <TabsTrigger value="voyage">Voyage</TabsTrigger>
              <TabsTrigger value="feed">Feed</TabsTrigger>
              <TabsTrigger value="band">Crew</TabsTrigger>
              <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
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
              value="artifacts"
              className="min-h-0 flex-1 overflow-hidden border-t border-border"
            >
              {artifacts}
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

function FolderPanel({
  side,
  label,
  badge,
  open,
  onOpenChange,
  className,
  children,
}: {
  side: "left" | "right"
  label: string
  badge?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
  children: React.ReactNode
}) {
  const isLeft = side === "left"
  const Chevron = isLeft ? IconChevronLeft : IconChevronRight
  return (
    <div
      className={cn(
        "absolute inset-y-3 z-10 transition-[translate,opacity] duration-250 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform motion-reduce:transition-none",
        isLeft ? "left-3" : "right-3",
        !open &&
          (isLeft
            ? "-translate-x-[calc(100%+0.75rem)]"
            : "translate-x-[calc(100%+0.75rem)]"),
        className
      )}
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} ${label.toLowerCase()} panel`}
        className={cn(
          "group/tab absolute top-10.25 z-10 flex flex-col items-center gap-1.5 border border-border bg-card/90 px-1 py-2.5 text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground",
          isLeft
            ? "left-[calc(100%-1px)] rounded-r-lg border-l-0"
            : "right-[calc(100%-1px)] rounded-l-lg border-r-0"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -top-2 size-2",
            isLeft
              ? "left-0 bg-[radial-gradient(circle_at_100%_0,transparent_7.5px,color-mix(in_srgb,var(--card)_90%,transparent)_8px)]"
              : "right-0 bg-[radial-gradient(circle_at_0_0,transparent_7.5px,color-mix(in_srgb,var(--card)_90%,transparent)_8px)]"
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -bottom-2 size-2",
            isLeft
              ? "left-0 bg-[radial-gradient(circle_at_100%_100%,transparent_7.5px,color-mix(in_srgb,var(--card)_90%,transparent)_8px)]"
              : "right-0 bg-[radial-gradient(circle_at_0_100%,transparent_7.5px,color-mix(in_srgb,var(--card)_90%,transparent)_8px)]"
          )}
        />
        <Chevron
          className={cn(
            "size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            !open && "rotate-180"
          )}
        />
        <span className="text-[10px] font-semibold tracking-wide uppercase [writing-mode:vertical-rl]">
          {label}
        </span>
        {badge && (
          <span className="tabular text-[10px] text-muted-foreground/70">
            {badge}
          </span>
        )}
      </button>
      <div
        aria-hidden={!open}
        className={cn(
          "flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card/90 shadow-lg backdrop-blur-md",
          !open && "pointer-events-none"
        )}
      >
        {children}
      </div>
    </div>
  )
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
