import * as React from "react"
import { IconFocusCentered, IconMinus, IconPlus } from "@tabler/icons-react"

import type { AgentKey } from "@/lib/domain"
import type { Run } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  BARGE_AT,
  DEPARTURE_POINT,
  FACILITIES,
  FERRY_AT,
  sceneBounds,
  TUG_ATS,
} from "./layout"
import { deriveHarborState } from "./state"
import { useVoyages } from "./use-voyages"
import { HarborWater } from "./components/water"
import { RouteLayer } from "./components/routes"
import { Facility } from "./components/facility"
import { SceneryBack, SceneryFront } from "./components/scenery"
import { Barge, Cargo, Ferry, Tug } from "./components/cargo"

interface View {
  scale: number
  tx: number
  ty: number
}

const MIN_SCALE = 0.35
const MAX_SCALE = 2.6

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

const DEPTH_SORTED = [...FACILITIES].sort((a, b) => a.gx + a.gy - (b.gx + b.gy))

export function HarborMap({
  run,
  selectedAgent,
  onSelectAgent,
  className,
}: {
  run: Run
  selectedAgent?: AgentKey | null
  onSelectAgent?: (a: AgentKey | null) => void
  className?: string
}) {
  const bounds = React.useMemo(() => sceneBounds(), [])
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [size, setSize] = React.useState({ w: 0, h: 0 })
  const [view, setView] = React.useState<View>({ scale: 1, tx: 0, ty: 0 })
  const interacted = React.useRef(false)
  const drag = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const harbor = React.useMemo(() => deriveHarborState(run), [run])
  const voyages = useVoyages(run)
  const started = run.status !== "pending"

  const fit = React.useCallback(
    (w: number, h: number) => {
      const pad = 44
      const s = clamp(
        Math.min((w - pad * 2) / bounds.w, (h - pad * 2) / bounds.h),
        MIN_SCALE,
        MAX_SCALE,
      )
      return {
        scale: s,
        tx: (w - bounds.w * s) / 2 - bounds.minX * s,
        ty: (h - bounds.h * s) / 2 - bounds.minY * s,
      }
    },
    [bounds],
  )

  React.useLayoutEffect(() => {
    const el = wrapRef.current
    if (el) setSize({ w: el.clientWidth, h: el.clientHeight })
  }, [])

  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  React.useEffect(() => {
    if (size.w === 0 || interacted.current) return
    setView(fit(size.w, size.h))
  }, [size, fit])

  const resetView = React.useCallback(() => {
    interacted.current = false
    if (size.w > 0) setView(fit(size.w, size.h))
  }, [size, fit])

  const zoomBy = React.useCallback(
    (k: number, cx?: number, cy?: number) => {
      interacted.current = true
      setView((v) => {
        const target = clamp(v.scale * k, MIN_SCALE, MAX_SCALE)
        const factor = target / v.scale
        const px = cx ?? size.w / 2
        const py = cy ?? size.h / 2
        return {
          scale: target,
          tx: px - (px - v.tx) * factor,
          ty: py - (py - v.ty) * factor,
        }
      })
    },
    [size],
  )

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    interacted.current = true
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    setView((v) => ({ ...v, tx: drag.current!.tx + dx, ty: drag.current!.ty + dy }))
  }
  const endDrag = () => {
    drag.current = null
  }

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative min-h-0 flex-1 overflow-hidden bg-grid select-none",
        className,
      )}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className="block cursor-grab touch-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {size.w > 0 && (
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            <HarborWater bounds={bounds} />
            <RouteLayer facility={harbor.facility} />

            {TUG_ATS.map((p, i) => (
              <Tug key={i} at={p} />
            ))}
            <Barge at={BARGE_AT} loaded />
            {started && <Ferry at={FERRY_AT} />}

            <SceneryBack />

            {DEPTH_SORTED.map((def) => (
              <Facility
                key={def.key}
                def={def}
                visual={harbor.facility[def.key]}
                selected={selectedAgent === def.key}
                onSelect={
                  onSelectAgent
                    ? () =>
                        onSelectAgent(
                          selectedAgent === def.key ? null : def.key,
                        )
                    : undefined
                }
              />
            ))}

            <SceneryFront />

            {voyages.map((v) => (
              <Cargo key={v.id} voyage={v} />
            ))}

            {harbor.departed && <Ferry at={DEPARTURE_POINT} departing />}
          </g>
        )}
      </svg>

      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <MapButton label="Zoom in" onClick={() => zoomBy(1.2)}>
          <IconPlus className="size-4" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
          <IconMinus className="size-4" />
        </MapButton>
        <MapButton label="Reset view" onClick={resetView}>
          <IconFocusCentered className="size-4" />
        </MapButton>
      </div>
    </div>
  )
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card/85 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
    >
      {children}
    </button>
  )
}
