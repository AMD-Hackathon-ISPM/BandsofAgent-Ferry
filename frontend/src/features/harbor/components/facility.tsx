import { AGENTS } from "@/lib/domain"
import { boxFaces, HH, HW, poly, type Pt } from "../iso"
import { facilityAnchor, type FacilityDef } from "../layout"
import { VISUAL_ACCENT, type FacilityVisual } from "../state"

function mix(color: string, other: string, pct: number): string {
  return `color-mix(in oklch, ${color} ${pct}%, ${other})`
}

function lights(c: Pt, fp: number, height: number): Pt[] {
  const start = { x: c.x, y: c.y + HH * fp - height }
  const end = { x: c.x + HW * fp, y: c.y - height }
  return [0.32, 0.5, 0.68].map((t) => ({
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t + 7,
  }))
}

function Crane({ c, fp, height, active }: { c: Pt; fp: number; height: number; active: boolean }) {
  const baseX = c.x + HW * fp * 0.42
  const baseY = c.y - height
  const topY = baseY - 46
  const armX = c.x - HW * fp * 0.5
  const stroke = "color-mix(in oklch, var(--foreground) 55%, transparent)"
  return (
    <g>
      <line x1={baseX} y1={baseY} x2={baseX} y2={topY} stroke={stroke} strokeWidth={2.5} />
      <line x1={baseX} y1={topY} x2={armX} y2={topY - 8} stroke={stroke} strokeWidth={2.5} />
      <g className={active ? "harbor-load" : undefined}>
        <line
          x1={(baseX + armX) / 2}
          y1={topY - 4}
          x2={(baseX + armX) / 2}
          y2={topY + 14}
          stroke={stroke}
          strokeWidth={1.25}
        />
        <rect
          x={(baseX + armX) / 2 - 6}
          y={topY + 14}
          width={12}
          height={9}
          rx={1}
          fill="color-mix(in oklch, var(--agent-codegen) 70%, #000 12%)"
        />
      </g>
    </g>
  )
}

function MiniStack({ c, color }: { c: Pt; color: string }) {
  const box = (o: Pt, h: number) => {
    const f = boxFaces({ x: c.x + o.x, y: c.y + o.y }, h, 0.22)
    return (
      <g>
        <polygon points={poly(f.left)} fill={mix(color, "#000", 52)} />
        <polygon points={poly(f.right)} fill={mix(color, "#000", 66)} />
        <polygon points={poly(f.top)} fill={mix(color, "white", 70)} />
      </g>
    )
  }
  return (
    <g opacity={0.9}>
      {box({ x: -16, y: 8 }, 13)}
      {box({ x: 2, y: 14 }, 16)}
    </g>
  )
}

export function Facility({
  def,
  visual,
  selected,
  onSelect,
}: {
  def: FacilityDef
  visual: FacilityVisual
  selected?: boolean
  onSelect?: () => void
}) {
  const meta = AGENTS[def.key]
  const Icon = meta.icon
  const c = facilityAnchor(def)
  const fp = def.footprint
  const accent = VISUAL_ACCENT[visual]
  const isRunning = visual === "running"
  const isSkipped = visual === "skipped"
  const isFailed = visual === "failed"
  const isSuccess = visual === "success"

  const base = isSkipped
    ? mix(meta.color, "var(--muted)", 26)
    : visual === "idle"
      ? mix(meta.color, "var(--muted)", 62)
      : meta.color

  const faces = boxFaces(c, def.height, fp)
  const roofCenter = { x: c.x, y: c.y - def.height }
  const apex = { x: c.x, y: c.y - HH * fp - def.height }
  const lightPts = lights(c, fp, def.height)
  const lightFill = isSkipped
    ? "transparent"
    : accent ?? "color-mix(in oklch, var(--warning) 78%, transparent)"

  const labelTop = c.y + HH * fp + 18

  return (
    <g
      onClick={onSelect}
      style={{ cursor: onSelect ? "pointer" : "default" }}
      opacity={isSkipped ? 0.55 : 1}
    >
      <ellipse
        cx={c.x}
        cy={c.y + HH * fp * 0.5}
        rx={HW * fp * 1.05}
        ry={HH * fp * 0.62}
        fill="#000"
        opacity={0.22}
      />

      {accent && (isRunning || visual === "waiting" || isFailed) && (
        <ellipse
          className={isRunning ? "harbor-beacon" : isFailed ? "harbor-flash" : undefined}
          cx={c.x}
          cy={c.y}
          rx={HW * fp * 1.25}
          ry={HH * fp * 1.2}
          fill={accent}
          opacity={0.18}
        />
      )}

      <polygon
        points={poly(faces.left)}
        fill={mix(base, "#000", 52)}
        stroke={isSkipped ? "color-mix(in oklch, var(--border) 60%, transparent)" : undefined}
        strokeDasharray={isSkipped ? "3 3" : undefined}
      />
      <polygon points={poly(faces.right)} fill={mix(base, "#000", 68)} />
      <polygon
        points={poly(faces.top)}
        fill={mix(base, "white", isSkipped ? 30 : 74)}
        stroke={selected ? accent ?? "var(--signal)" : undefined}
        strokeWidth={selected ? 2 : undefined}
      />

      {!isSkipped &&
        lightPts.map((p, i) => (
          <circle
            key={i}
            className={isRunning ? "harbor-beacon" : undefined}
            cx={p.x}
            cy={p.y}
            r={2.2}
            fill={lightFill}
            opacity={isRunning || isFailed ? 1 : 0.85}
          />
        ))}

      {def.hasCrane && !isSkipped && (
        <Crane c={c} fp={fp} height={def.height} active={isRunning} />
      )}

      {def.kind === "tower" && (
        <g>
          <line
            x1={apex.x}
            y1={apex.y}
            x2={apex.x}
            y2={apex.y - 16}
            stroke="color-mix(in oklch, var(--foreground) 50%, transparent)"
            strokeWidth={2}
          />
          <circle
            className={isRunning ? "harbor-beacon" : undefined}
            cx={apex.x}
            cy={apex.y - 18}
            r={3}
            fill={accent ?? "var(--signal)"}
          />
        </g>
      )}

      {isSuccess && <MiniStack c={c} color={meta.color} />}

      <g transform={`translate(${roofCenter.x - 11}, ${roofCenter.y - 11})`}>
        <rect
          x={0}
          y={0}
          width={22}
          height={22}
          rx={5}
          fill={mix("var(--card)", accent ?? meta.color, 22)}
          stroke={mix(meta.color, "transparent", 55)}
          strokeWidth={1}
        />
        <g
          transform="translate(3,3)"
          style={{ color: isSkipped ? "var(--muted-foreground)" : meta.color }}
        >
          <Icon size={16} stroke={1.8} />
        </g>
      </g>

      {def.kind === "tower" && accent && isRunning && (
        <circle
          className="harbor-beacon"
          cx={roofCenter.x}
          cy={roofCenter.y}
          r={15}
          fill="none"
          stroke={accent}
          strokeWidth={1.5}
          opacity={0.5}
        />
      )}

      <text
        x={c.x}
        y={labelTop}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="var(--foreground)"
        stroke="var(--background)"
        strokeWidth={3}
        paintOrder="stroke"
        style={{ pointerEvents: "none" }}
      >
        {def.title}
      </text>
      <text
        x={c.x}
        y={labelTop + 13}
        textAnchor="middle"
        fontSize={9.5}
        fill="var(--muted-foreground)"
        stroke="var(--background)"
        strokeWidth={2.5}
        paintOrder="stroke"
        style={{ pointerEvents: "none" }}
      >
        {meta.name}
      </text>
    </g>
  )
}
