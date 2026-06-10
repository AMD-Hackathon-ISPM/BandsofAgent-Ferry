import { isoToScreen, type Pt } from "../iso"
import { IsoBox, Shadow } from "./prims"

function up(p: Pt, d: number): Pt {
  return { x: p.x, y: p.y - d }
}
const at = (gx: number, gy: number): Pt => isoToScreen(gx, gy)

function Tree({ c }: { c: Pt }) {
  const f = up(c, 8)
  return (
    <g>
      <Shadow c={{ x: c.x, y: c.y + 2 }} rx={11} ry={4.5} opacity={0.2} />
      <IsoBox c={c} du={0.12} dv={0.12} h={8} color="oklch(0.42 0.05 60)" />
      <circle cx={f.x} cy={f.y - 2} r={11} fill="oklch(0.48 0.09 150)" />
      <circle cx={f.x - 3} cy={f.y - 6} r={8} fill="oklch(0.58 0.11 150)" />
      <circle cx={f.x - 5} cy={f.y - 8} r={4} fill="oklch(0.66 0.12 150)" />
    </g>
  )
}

function Lamp({ c }: { c: Pt }) {
  const top = up(c, 24)
  return (
    <g>
      <Shadow c={{ x: c.x, y: c.y + 1 }} rx={5} ry={2.2} opacity={0.18} />
      <IsoBox c={c} du={0.1} dv={0.1} h={4} color="oklch(0.4 0.01 250)" />
      <line x1={c.x} y1={c.y - 3} x2={top.x} y2={top.y} stroke="oklch(0.5 0.01 250)" strokeWidth={1.5} />
      <line x1={top.x} y1={top.y} x2={top.x + 7} y2={top.y - 1} stroke="oklch(0.5 0.01 250)" strokeWidth={1.5} />
      <circle cx={top.x + 8} cy={top.y} r={4.5} fill="oklch(0.85 0.13 88)" opacity={0.3} />
      <circle cx={top.x + 8} cy={top.y} r={2.2} fill="oklch(0.9 0.13 90)" />
    </g>
  )
}

function Bollard({ c }: { c: Pt }) {
  return (
    <g>
      <ellipse cx={c.x} cy={c.y} rx={4} ry={2} fill="oklch(0.32 0.02 250)" />
      <rect x={c.x - 3} y={c.y - 7} width={6} height={7} rx={2} fill="oklch(0.45 0.03 250)" />
      <ellipse cx={c.x} cy={c.y - 7} rx={3} ry={1.4} fill="oklch(0.58 0.03 250)" />
    </g>
  )
}

function Container({ c, color, h = 13 }: { c: Pt; color: string; h?: number }) {
  return <IsoBox c={c} du={0.62} dv={0.32} h={h} color={color} />
}

function Truck({ c, color }: { c: Pt; color: string }) {
  return (
    <g>
      <Shadow c={{ x: c.x, y: c.y + 2 }} rx={26} ry={8} opacity={0.18} />
      <IsoBox c={{ x: c.x + 8, y: c.y + 4 }} du={0.66} dv={0.34} h={11} color="oklch(0.86 0.01 250)" />
      <IsoBox c={{ x: c.x - 18, y: c.y - 5 }} du={0.28} dv={0.34} h={13} color={color} />
    </g>
  )
}

function Car({ c, color }: { c: Pt; color: string }) {
  const body = { x: c.x, y: c.y }
  return (
    <g>
      <Shadow c={{ x: c.x, y: c.y + 1 }} rx={15} ry={5} opacity={0.16} />
      <IsoBox c={body} du={0.5} dv={0.28} h={5} color={color} />
      <IsoBox c={up(body, 5)} du={0.32} dv={0.24} h={4} color="oklch(0.78 0.03 230)" />
    </g>
  )
}

const TREES = [
  at(-0.5, 3.15),
  at(1.3, 3.25),
  at(4.5, 3.2),
  at(6.4, 3.1),
  at(7.6, 2.95),
]
const FRONT_LAMPS = [at(0.2, 3.45), at(2.4, 3.5), at(4.8, 3.5), at(7.0, 3.45)]
const BACK_BOLLARDS = [
  at(0, 0.95),
  at(1.2, 0.95),
  at(2.4, 0.95),
  at(3.6, 0.95),
  at(4.8, 0.95),
  at(6.0, 0.95),
  at(7.2, 0.95),
]
const FRONT_BOLLARDS = [at(0.6, 3.55), at(3.0, 3.6), at(5.6, 3.55)]
const YARD = [
  { c: at(3.0, 3.0), color: "oklch(0.62 0.2 25)", h: 14 },
  { c: at(3.0, 3.32), color: "oklch(0.6 0.13 240)", h: 14 },
  { c: at(3.42, 3.05), color: "oklch(0.78 0.14 85)", h: 11 },
  { c: at(3.42, 3.36), color: "oklch(0.64 0.13 150)", h: 11 },
]
const VEHICLES: Array<{ c: Pt; kind: "truck" | "car"; color: string }> = [
  { c: at(5.0, 2.95), kind: "truck", color: "oklch(0.55 0.15 250)" },
  { c: at(5.7, 3.15), kind: "car", color: "oklch(0.7 0.16 30)" },
  { c: at(6.2, 3.3), kind: "car", color: "oklch(0.8 0.12 90)" },
  { c: at(1.6, 2.9), kind: "truck", color: "oklch(0.6 0.13 150)" },
  { c: at(0.9, 3.2), kind: "car", color: "oklch(0.72 0.1 240)" },
]

export function SceneryBack() {
  return (
    <g>
      {BACK_BOLLARDS.map((c, i) => (
        <Bollard key={i} c={c} />
      ))}
    </g>
  )
}

export function SceneryFront() {
  return (
    <g>
      {YARD.map((y, i) => (
        <Container key={`y${i}`} c={y.c} color={y.color} h={y.h} />
      ))}
      {VEHICLES.map((v, i) =>
        v.kind === "truck" ? (
          <Truck key={`v${i}`} c={v.c} color={v.color} />
        ) : (
          <Car key={`v${i}`} c={v.c} color={v.color} />
        ),
      )}
      {TREES.map((c, i) => (
        <Tree key={`t${i}`} c={c} />
      ))}
      {FRONT_BOLLARDS.map((c, i) => (
        <Bollard key={`b${i}`} c={c} />
      ))}
      {FRONT_LAMPS.map((c, i) => (
        <Lamp key={`l${i}`} c={c} />
      ))}
    </g>
  )
}
