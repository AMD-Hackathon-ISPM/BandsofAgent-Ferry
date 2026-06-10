import { along, HH, HW, isoBox, mix, poly, subQuad, type Pt } from "../iso"
import type { Voyage } from "../use-voyages"
import { IsoBox, Shadow, Windows } from "./prims"

function up(p: Pt, d: number): Pt {
  return { x: p.x, y: p.y - d }
}
function shift(p: Pt, du: number, dv: number): Pt {
  return { x: p.x + (du - dv) * HW, y: p.y + (du + dv) * HH }
}

const HULL = "oklch(0.95 0.006 250)"
const DECK_GREEN = "oklch(0.64 0.12 150)"
const WARM = "oklch(0.86 0.12 86)"

export function Cargo({ voyage }: { voyage: Voyage }) {
  const t = Math.min(1, voyage.t)
  const pos = along(voyage.from, voyage.to, t)
  const fade = voyage.t > 0.92 ? Math.max(0, (1.06 - voyage.t) / 0.14) : 1
  const faces = isoBox(pos, 0.34, 0.34, 17)
  return (
    <g opacity={fade}>
      <Shadow c={{ x: pos.x, y: pos.y + 3 }} rx={17} ry={6} opacity={0.18} />
      <polygon points={poly(faces.left)} fill={mix(voyage.color, "#000", 46)} />
      <polygon points={poly(faces.right)} fill={mix(voyage.color, "#000", 62)} />
      <polygon points={poly(faces.top)} fill={mix(voyage.color, "white", 76)} />
      <line
        x1={faces.right[0].x}
        y1={faces.right[0].y}
        x2={faces.right[3].x}
        y2={faces.right[3].y}
        stroke="color-mix(in oklch, #000 30%, transparent)"
        strokeWidth={0.75}
      />
    </g>
  )
}

export function Ferry({ at, departing = false }: { at: Pt; departing?: boolean }) {
  const accent = departing ? "var(--success)" : "oklch(0.6 0.21 25)"
  const hullH = 14
  const supC = up(at, hullH)
  const supH = 13
  const topC = up(supC, supH)
  const topH = 4

  const hull = isoBox(at, 3.5, 0.95, hullH)
  const sup = isoBox(supC, 2.7, 0.64, supH)

  const funnelC = { x: topC.x - 0.8 * HW, y: topC.y - topH - 0.8 * HH }
  const boatA = shift({ x: supC.x, y: supC.y - supH * 0.2 }, 0.5, 0.42)
  const boatB = shift({ x: supC.x, y: supC.y - supH * 0.2 }, -0.4, 0.42)

  return (
    <g className="harbor-bob">
      <Shadow c={{ x: at.x, y: at.y + 6 }} rx={3.5 * HW * 0.5 + 16} ry={20} opacity={0.22} />

      <IsoBox c={at} du={3.5} dv={0.95} h={hullH} color={HULL} />
      <polygon points={poly(subQuad(hull.right, 0, 0.66, 1, 1))} fill={accent} />
      <polygon points={poly(subQuad(hull.left, 0, 0.66, 1, 1))} fill={mix(accent, "#000", 80)} />
      <polygon points={poly(subQuad(hull.right, 0, 0.12, 1, 0.2))} fill={accent} opacity={0.85} />
      <Windows face={hull.right} rows={1} cols={9} lit litColor={WARM} />

      <IsoBox c={supC} du={2.7} dv={0.64} h={supH} color={HULL} />
      <Windows face={sup.right} rows={2} cols={8} lit litColor={WARM} />
      <Windows face={sup.left} rows={2} cols={8} lit={false} litColor={WARM} />

      <IsoBox c={topC} du={2.1} dv={0.5} h={topH} color={DECK_GREEN} />

      <IsoBox c={boatA} du={0.34} dv={0.16} h={5} color="oklch(0.72 0.17 45)" />
      <IsoBox c={boatB} du={0.34} dv={0.16} h={5} color="oklch(0.72 0.17 45)" />

      <IsoBox c={funnelC} du={0.36} dv={0.34} h={12} color={accent} />
      <IsoBox c={up(funnelC, 12)} du={0.36} dv={0.34} h={2} color="oklch(0.25 0.02 250)" />
    </g>
  )
}

export function Tug({ at }: { at: Pt }) {
  const cabinC = up(at, 7)
  return (
    <g className="harbor-bob">
      <Shadow c={{ x: at.x, y: at.y + 3 }} rx={28} ry={9} opacity={0.2} />
      <IsoBox c={at} du={1.0} dv={0.56} h={7} color="oklch(0.66 0.2 40)" />
      <IsoBox c={cabinC} du={0.5} dv={0.34} h={8} color="oklch(0.95 0.006 250)" />
      <line
        x1={cabinC.x}
        y1={cabinC.y - 8}
        x2={cabinC.x}
        y2={cabinC.y - 18}
        stroke="color-mix(in oklch, var(--foreground) 45%, transparent)"
        strokeWidth={1.25}
      />
    </g>
  )
}

const BARGE_COLORS = [
  "oklch(0.62 0.2 25)",
  "oklch(0.6 0.13 240)",
  "oklch(0.64 0.13 150)",
  "oklch(0.78 0.14 85)",
]

export function Barge({ at, loaded = true }: { at: Pt; loaded?: boolean }) {
  const deckC = up(at, 9)
  const stacks: Pt[] = loaded
    ? [
        shift(deckC, 0.7, 0),
        shift(deckC, 0, 0),
        shift(deckC, -0.7, 0),
        shift(deckC, 0.7, 0.35),
        shift(deckC, 0, 0.35),
        shift(deckC, -0.7, 0.35),
      ]
    : []
  return (
    <g className="harbor-bob">
      <Shadow c={{ x: at.x, y: at.y + 5 }} rx={3 * HW * 0.5 + 12} ry={16} opacity={0.2} />
      <IsoBox c={at} du={3.0} dv={1.05} h={9} color="oklch(0.42 0.05 250)" />
      {stacks.map((s, i) => (
        <g key={i}>
          <IsoBox c={s} du={0.6} dv={0.3} h={i % 2 === 0 ? 16 : 11} color={BARGE_COLORS[i % BARGE_COLORS.length]} />
        </g>
      ))}
    </g>
  )
}
