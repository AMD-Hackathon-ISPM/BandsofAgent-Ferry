import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { IconExternalLink, IconX } from "@tabler/icons-react"

import type { AgentKey } from "@/lib/domain"
import type { AgentMessageVM, Run } from "@/lib/types"
import { cn } from "@/lib/utils"
import { PhasePipeline } from "@/features/runs/components/phase-pipeline"
import { deriveVoyage, type VoyageStatus } from "./progress"
import { useVoyageScene } from "./use-voyage-scene"
import { ShipLog } from "./ship-log"
import { setCrewMessages, setCrewRuntime } from "./cutaway/crew-sim"

/**
 * Dev-only scene override: append ?stage=dock|sail|arrived to force the
 * voyage into a stage (mock run statuses never advance on their own).
 */
function useDebugVoyage(voyage: VoyageStatus): VoyageStatus {
  const [params] = useSearchParams()
  if (!import.meta.env.DEV) return voyage
  switch (params.get("stage")) {
    case "dock":
      return { ...voyage, mode: "pending", target: 0 }
    case "sail":
      return { ...voyage, mode: "sailing" }
    case "arrived":
      return { ...voyage, mode: "arrived", target: 1, stop: 8 }
    default:
      return voyage
  }
}

export function VoyageView(props: {
  run: Run
  messages: AgentMessageVM[]
  streamedIds: Set<string>
  /** Reserved for the future zoom-into-the-ship interior mode. */
  selectedAgent?: AgentKey | null
  onSelectAgent?: (a: AgentKey | null) => void
  className?: string
  /** Hide the floating ship's log overlay (when it is docked elsewhere). */
  showLog?: boolean
  progressClassName?: string
  /** Play the full-screen loading harbor before sailing out. */
  intro?: boolean
  /** Fires once the ferry has pulled out and reached open water. */
  onDeparted?: () => void
}) {
  const {
    run,
    messages,
    streamedIds,
    className,
    showLog = true,
    progressClassName,
    intro = false,
    onDeparted,
  } = props
  const voyage = useDebugVoyage(deriveVoyage(run))
  const [inspecting, setInspecting] = React.useState(false)
  const introRef = React.useRef(intro)
  const onDepartedRef = React.useRef(onDeparted)
  React.useEffect(() => {
    onDepartedRef.current = onDeparted
  }, [onDeparted])
  const handleStage = React.useCallback((stage: string) => {
    // The harbor intro ends the moment the ferry reaches open water.
    if (introRef.current && stage === "sea") {
      introRef.current = false
      onDepartedRef.current?.()
    }
  }, [])
  const { wrapRef, canvasRef } = useVoyageScene(voyage, {
    onInspectChange: setInspecting,
    onStageChange: handleStage,
    introDock: intro,
  })

  // Feed the canvas crew sim (positions/interactions are drawn on the cutaway
  // by the scene's rAF loop, so this only hands it the latest run data).
  React.useEffect(() => {
    setCrewRuntime(run.agents)
  }, [run.agents])
  React.useEffect(() => {
    setCrewMessages(messages)
  }, [messages])

  return (
    <section
      className={cn("absolute inset-0 overflow-hidden", className)}
      aria-label="Voyage visualization"
    >
      <div
        ref={wrapRef}
        className="absolute inset-0 overflow-hidden bg-[#15223f]"
      >
        <canvas ref={canvasRef} className="pixel-canvas block" />
      </div>

      <div
        aria-hidden={!inspecting}
        className={cn(
          "pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card/85 px-3 py-1.5 font-mono text-[10px] tracking-wide text-muted-foreground shadow-lg backdrop-blur-sm transition-opacity duration-300",
          inspecting ? "opacity-100" : "opacity-0"
        )}
      >
        Drag to pan — scroll to zoom — Esc to return
      </div>

      {intro && !inspecting && (
        <div className="pointer-events-none absolute top-6 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card/85 px-3 py-1.5 font-mono text-[10px] tracking-wide text-muted-foreground shadow-lg backdrop-blur-sm">
          Loading the ferry — vehicles boarding, casting off shortly
        </div>
      )}

      {!intro && voyage.mode === "pending" && !inspecting && (
        <div className="pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card/85 px-3 py-1.5 font-mono text-[10px] tracking-wide text-muted-foreground shadow-lg backdrop-blur-sm">
          In queue — cargo loading, the ferry departs when the run starts
        </div>
      )}

      {showLog && !intro && (
        <ShipLog messages={messages} streamedIds={streamedIds} />
      )}
      {!intro && voyage.mode === "arrived" && run.pr && (
        <ArrivalPopup run={run} pr={run.pr} />
      )}
      {!intro && (
        <VoyageProgress run={run} className={progressClassName} />
      )}
    </section>
  )
}

/**
 * Celebratory arrival card: the ferry has moored at the PR harbor. The
 * outputs panel keeps the durable PR link; dismissal sticks for the session
 * so polling can't reopen it.
 */
function ArrivalPopup({
  run,
  pr,
}: {
  run: Run
  pr: NonNullable<Run["pr"]>
}) {
  const storageKey = `ferry-arrival-dismissed-${run.id}`
  const [dismissed, setDismissed] = React.useState(
    () => sessionStorage.getItem(storageKey) === "1"
  )
  if (dismissed) return null

  return (
    <aside className="pointer-events-auto absolute top-16 left-1/2 z-20 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 rounded-md border border-border bg-card/95 shadow-2xl backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[10px] text-muted-foreground uppercase">
            Arrived — pull request open
          </p>
          <h3 className="mt-1 truncate text-sm font-semibold text-primary">
            #{pr.number} {pr.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem(storageKey, "1")
            setDismissed(true)
          }}
          className="grid size-7 shrink-0 place-items-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Dismiss arrival notice"
        >
          <IconX className="size-4" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-3 text-xs">
        <span className="font-mono text-[10px] text-muted-foreground uppercase">
          {pr.sourceBranch} → {pr.targetBranch}
        </span>
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[10px] uppercase transition-colors hover:bg-accent"
        >
          View PR <IconExternalLink className="size-3" />
        </a>
      </div>
    </aside>
  )
}

function VoyageProgress({
  run,
  className,
}: {
  run: Run
  className?: string
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2",
        className
      )}
    >
      <div className="rounded-md border border-border bg-card/85 px-3 py-2 shadow-lg backdrop-blur-sm">
        <PhasePipeline run={run} density="compact" />
      </div>
    </div>
  )
}
