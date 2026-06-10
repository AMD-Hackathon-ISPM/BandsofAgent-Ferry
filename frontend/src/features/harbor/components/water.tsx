import { isoToScreen, poly, type Pt } from "../iso"
import type { SceneBounds } from "../layout"

function shift(p: Pt, dy: number): Pt {
  return { x: p.x, y: p.y + dy }
}

function Platform({
  gx0,
  gy0,
  gx1,
  gy1,
  wall = 14,
}: {
  gx0: number
  gy0: number
  gx1: number
  gy1: number
  wall?: number
}) {
  const c1 = isoToScreen(gx0, gy0)
  const c2 = isoToScreen(gx1, gy0)
  const c3 = isoToScreen(gx1, gy1)
  const c4 = isoToScreen(gx0, gy1)
  return (
    <g>
      <polygon
        points={poly([c4, c3, shift(c3, wall), shift(c4, wall)])}
        fill="color-mix(in oklch, var(--card) 64%, #000 30%)"
      />
      <polygon
        points={poly([c2, c3, shift(c3, wall), shift(c2, wall)])}
        fill="color-mix(in oklch, var(--card) 52%, #000 38%)"
      />
      <polygon
        points={poly([c1, c2, c3, c4])}
        fill="color-mix(in oklch, var(--card) 86%, var(--foreground) 7%)"
        stroke="color-mix(in oklch, var(--foreground) 12%, transparent)"
        strokeWidth={1}
      />
    </g>
  )
}

function IsoGrid({
  gx0,
  gy0,
  gx1,
  gy1,
}: {
  gx0: number
  gy0: number
  gx1: number
  gy1: number
}) {
  const lines: Array<[Pt, Pt]> = []
  for (let gx = Math.ceil(gx0); gx <= Math.floor(gx1); gx++) {
    lines.push([isoToScreen(gx, gy0), isoToScreen(gx, gy1)])
  }
  for (let gy = Math.ceil(gy0); gy <= Math.floor(gy1); gy++) {
    lines.push([isoToScreen(gx0, gy), isoToScreen(gx1, gy)])
  }
  return (
    <g
      stroke="color-mix(in oklch, var(--foreground) 7%, transparent)"
      strokeWidth={1}
    >
      {lines.map(([a, b], i) => (
        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      ))}
    </g>
  )
}

export function HarborWater({ bounds }: { bounds: SceneBounds }) {
  const { minX, minY, w, h } = bounds
  return (
    <g>
      <defs>
        <linearGradient id="ferry-sea" x1="0" y1="0" x2="0.4" y2="1">
          <stop
            offset="0%"
            stopColor="color-mix(in oklch, var(--background) 62%, var(--primary) 38%)"
          />
          <stop
            offset="100%"
            stopColor="color-mix(in oklch, var(--background) 84%, var(--primary) 16%)"
          />
        </linearGradient>
      </defs>

      <rect x={minX} y={minY} width={w} height={h} fill="url(#ferry-sea)" />

      <g
        className="sea-shimmer"
        stroke="color-mix(in oklch, var(--primary-bright) 22%, transparent)"
        strokeWidth={1.5}
        fill="none"
      >
        {Array.from({ length: 7 }).map((_, i) => {
          const y = minY + (h / 8) * (i + 1)
          return (
            <line key={i} x1={minX + 20} y1={y} x2={minX + w - 20} y2={y} />
          )
        })}
      </g>

      <Platform gx0={-0.75} gy0={1.05} gx1={7.75} gy1={2.95} />
      <IsoGrid gx0={-0.75} gy0={1.05} gx1={7.75} gy1={2.95} />
      <Platform gx0={1.55} gy0={-1.15} gx1={3.45} gy1={0.35} wall={12} />
    </g>
  )
}
