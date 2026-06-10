import { isoToScreen, poly, type Pt } from "../iso"
import {
  ISLAND,
  ISLAND_DEPTH,
  QUAY,
  TOWER_PAD,
  type SceneBounds,
} from "../layout"

const WATER_TOP = "oklch(0.36 0.05 220)"
const WATER_WALL_L = "oklch(0.29 0.045 222)"
const WATER_WALL_R = "oklch(0.24 0.04 224)"
const QUAY_TOP = "oklch(0.71 0.028 78)"
const QUAY_WALL_L = "oklch(0.6 0.03 72)"
const QUAY_WALL_R = "oklch(0.51 0.03 68)"

function down(p: Pt, dy: number): Pt {
  return { x: p.x, y: p.y + dy }
}
function up(p: Pt, dy: number): Pt {
  return { x: p.x, y: p.y - dy }
}

function Slab() {
  const n = isoToScreen(ISLAND.gx0, ISLAND.gy0)
  const e = isoToScreen(ISLAND.gx1, ISLAND.gy0)
  const s = isoToScreen(ISLAND.gx1, ISLAND.gy1)
  const w = isoToScreen(ISLAND.gx0, ISLAND.gy1)
  const d = ISLAND_DEPTH
  return (
    <g>
      <polygon points={poly([w, s, down(s, d), down(w, d)])} fill={WATER_WALL_L} />
      <polygon points={poly([e, s, down(s, d), down(e, d)])} fill={WATER_WALL_R} />
      <polygon
        points={poly([n, e, s, w])}
        fill={WATER_TOP}
        stroke="color-mix(in oklch, #000 30%, transparent)"
        strokeWidth={1}
      />
    </g>
  )
}

function RaisedPad({
  gx0,
  gy0,
  gx1,
  gy1,
  h,
}: {
  gx0: number
  gy0: number
  gx1: number
  gy1: number
  h: number
}) {
  const n = isoToScreen(gx0, gy0)
  const e = isoToScreen(gx1, gy0)
  const s = isoToScreen(gx1, gy1)
  const w = isoToScreen(gx0, gy1)
  return (
    <g>
      <polygon points={poly([up(w, h), up(s, h), s, w])} fill={QUAY_WALL_L} />
      <polygon points={poly([up(e, h), up(s, h), s, e])} fill={QUAY_WALL_R} />
      <polygon
        points={poly([up(n, h), up(e, h), up(s, h), up(w, h)])}
        fill={QUAY_TOP}
        stroke="color-mix(in oklch, #000 20%, transparent)"
        strokeWidth={1}
      />
    </g>
  )
}

function Ripples() {
  const spots: Array<{ c: Pt; r: number }> = [
    { c: isoToScreen(-0.8, 0.6), r: 16 },
    { c: isoToScreen(0.4, -0.9), r: 11 },
    { c: isoToScreen(2.2, -1.4), r: 13 },
    { c: isoToScreen(-1.8, 2.4), r: 18 },
    { c: isoToScreen(4.6, -1.1), r: 12 },
  ]
  return (
    <g
      fill="none"
      stroke="color-mix(in oklch, white 16%, transparent)"
      strokeWidth={1.25}
    >
      {spots.map((sp, i) => (
        <g key={i}>
          <ellipse cx={sp.c.x} cy={sp.c.y} rx={sp.r} ry={sp.r * 0.5} />
          <ellipse cx={sp.c.x} cy={sp.c.y} rx={sp.r * 0.55} ry={sp.r * 0.28} />
        </g>
      ))}
    </g>
  )
}

export function HarborWater({ bounds }: { bounds: SceneBounds }) {
  void bounds
  return (
    <g>
      <Slab />
      <g className="sea-shimmer">
        <Ripples />
      </g>
      <RaisedPad {...TOWER_PAD} />
      <RaisedPad {...QUAY} />
    </g>
  )
}
