import { along, boxFaces, poly, type Pt } from "../iso"
import type { Voyage } from "../use-voyages"

function mix(color: string, other: string, pct: number): string {
  return `color-mix(in oklch, ${color} ${pct}%, ${other})`
}

export function Cargo({ voyage }: { voyage: Voyage }) {
  const t = Math.min(1, voyage.t)
  const pos = along(voyage.from, voyage.to, t)
  const faces = boxFaces(pos, 16, 0.26)
  const fade = voyage.t > 0.92 ? Math.max(0, (1.06 - voyage.t) / 0.14) : 1
  return (
    <g opacity={fade}>
      <ellipse cx={pos.x} cy={pos.y + 4} rx={16} ry={6} fill="#000" opacity={0.18} />
      <polygon points={poly(faces.left)} fill={mix(voyage.color, "#000", 50)} />
      <polygon points={poly(faces.right)} fill={mix(voyage.color, "#000", 64)} />
      <polygon points={poly(faces.top)} fill={mix(voyage.color, "white", 72)} />
    </g>
  )
}

export function Ship({
  at,
  accent,
  bob = true,
}: {
  at: Pt
  accent: string
  bob?: boolean
}) {
  return (
    <g
      transform={`translate(${at.x}, ${at.y})`}
      className={bob ? "harbor-bob" : undefined}
    >
      <ellipse cx={0} cy={16} rx={34} ry={8} fill="#000" opacity={0.2} />
      <polygon
        points="-32,2 32,2 24,16 -24,16"
        fill="color-mix(in oklch, var(--card) 70%, #000 24%)"
        stroke="color-mix(in oklch, var(--foreground) 22%, transparent)"
        strokeWidth={1}
      />
      <rect x={-16} y={-12} width={14} height={14} rx={1} fill={mix(accent, "white", 64)} />
      <rect x={2} y={-12} width={14} height={14} rx={1} fill={mix(accent, "#000", 30)} />
      <line x1={22} y1={2} x2={22} y2={-20} stroke="color-mix(in oklch, var(--foreground) 40%, transparent)" strokeWidth={1.5} />
      <polygon points="22,-20 22,-10 33,-15" fill={accent} />
    </g>
  )
}
