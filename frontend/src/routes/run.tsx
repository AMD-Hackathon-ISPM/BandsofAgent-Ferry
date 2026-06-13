import * as React from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
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
import { ShipLog } from "@/features/voyage/ship-log"
import { RunHeader } from "@/features/runs/components/run-header"
import { VoyageView } from "@/features/voyage/voyage-view"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function RunSkeleton() {
  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-hidden">
      <div className="flex min-h-14 items-center gap-3 border-b border-border px-3 py-2 sm:px-4">
        <Skeleton className="size-7 shrink-0" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="hidden h-4 w-64 lg:block" />
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="size-7 shrink-0" />
            ))}
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
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
  const [leftOpen, setLeftOpen] = React.useState(true)
  const [rightOpen, setRightOpen] = React.useState(true)
  const isXL = useMediaQuery("(min-width: 1280px)")

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
    run.status === "pending" || justLaunched ? "loading" : "normal"
  )
  const loading = phase === "loading"
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
      showLog={!isXL}
      intro={loading}
      onDeparted={onDeparted}
    />
  )

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-hidden">
      <div
        className={cn(
          "shrink-0 transition-all duration-700 ease-out",
          loading
            ? "pointer-events-none max-h-0 -translate-y-4 opacity-0"
            : "max-h-[16rem] opacity-100"
        )}
      >
        <RunHeader
          run={liveRun}
          role={role}
          now={now}
          dbApproved={dbApproved}
          selectedPhase={selectedPhase}
          onSelectPhase={setSelectedPhase}
        />

        <RunBanner run={liveRun} onAction={handleAction} />
      </div>

      {isXL ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {voyage}

          <FolderPanel
            side="left"
            label="The band"
            badge={activeAgents > 0 ? String(activeAgents) : undefined}
            open={leftOpen}
            onOpenChange={setLeftOpen}
            className={cn(
              "w-72 transition-[opacity,transform] duration-700",
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
            badge={
              run.artifacts.length > 0 ? String(run.artifacts.length) : undefined
            }
            open={rightOpen}
            onOpenChange={setRightOpen}
            className={cn(
              "w-80 transition-[opacity,transform] duration-700",
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
              Band room
            </CenterToggle>
            <span className="max-w-48 truncate px-1 text-[11px] text-muted-foreground">
              {run.bandRoomName}
            </span>
          </div>

          {centerView === "feed" && (
            <div
              className={cn(
                "absolute top-14 bottom-3 z-10 overflow-hidden rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur-md transition-[left,right] duration-300 ease-in-out",
                leftOpen ? "left-83" : "left-8",
                rightOpen ? "right-91" : "right-8"
              )}
            >
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
            <TabsList
              className={cn(
                "m-2 self-start transition-opacity duration-700",
                loading && "pointer-events-none opacity-0"
              )}
            >
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
        "absolute inset-y-3 z-10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
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
            "size-3.5 transition-transform duration-500",
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
          "flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card/90 shadow-lg backdrop-blur-md transition-opacity duration-500",
          !open && "pointer-events-none opacity-60"
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
