import type { AgentKey } from "@/lib/domain"
import { LANE_SEGMENTS } from "../layout"
import type { FacilityVisual } from "../state"

type SegState = "done" | "active" | "failed" | "upcoming"

const SEG_COLOR: Record<SegState, string> = {
  done: "var(--success)",
  active: "var(--signal)",
  failed: "var(--destructive)",
  upcoming: "var(--muted-foreground)",
}

function segState(toVisual: FacilityVisual): SegState {
  if (toVisual === "failed") return "failed"
  if (toVisual === "running") return "active"
  if (toVisual === "success" || toVisual === "skipped") return "done"
  return "upcoming"
}

export function RouteLayer({
  facility,
}: {
  facility: Record<AgentKey, FacilityVisual>
}) {
  return (
    <g>
      {LANE_SEGMENTS.map((seg) => {
        const state = segState(facility[seg.to])
        const color = SEG_COLOR[state]
        const upcoming = state === "upcoming"
        return (
          <g key={`${seg.from}-${seg.to}`}>
            <line
              x1={seg.a.x}
              y1={seg.a.y}
              x2={seg.b.x}
              y2={seg.b.y}
              stroke={`color-mix(in oklch, ${color} 22%, transparent)`}
              strokeWidth={11}
              strokeLinecap="round"
            />
            <line
              x1={seg.a.x}
              y1={seg.a.y}
              x2={seg.b.x}
              y2={seg.b.y}
              className={state === "active" ? "harbor-flow" : undefined}
              stroke={color}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeDasharray={
                state === "active" ? "6 10" : upcoming ? "2 8" : undefined
              }
              opacity={upcoming ? 0.45 : 0.95}
            />
          </g>
        )
      })}
    </g>
  )
}
