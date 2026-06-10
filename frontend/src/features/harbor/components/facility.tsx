import { AGENTS } from "@/lib/domain"
import { HH, HW, isoBox, mix, type Pt } from "../iso"
import { facilityAnchor, type FacilityDef } from "../layout"
import { VISUAL_ACCENT, type FacilityVisual } from "../state"
import { IsoBox, Shadow, Windows } from "./prims"

const WARM = "oklch(0.86 0.12 86)"
const APRON = "oklch(0.64 0.02 82)"

function up(p: Pt, d: number): Pt {
  return { x: p.x, y: p.y - d }
}

function Crane({ base, fp, active }: { base: Pt; fp: number; active: boolean }) {
  const baseX = base.x + HW * fp * 0.4
  const baseY = base.y
  const topY = baseY - 48
  const armX = base.x - HW * fp * 0.55
  const mid = (baseX + armX) / 2
  const stroke = "color-mix(in oklch, var(--foreground) 52%, transparent)"
  return (
    <g>
      <line x1={baseX} y1={baseY} x2={baseX} y2={topY} stroke={stroke} strokeWidth={2.5} />
      <line x1={baseX} y1={topY} x2={armX} y2={topY - 7} stroke={stroke} strokeWidth={2.5} />
      <g className={active ? "harbor-load" : undefined}>
        <line x1={mid} y1={topY - 3} x2={mid} y2={topY + 13} stroke={stroke} strokeWidth={1.25} />
        <rect
          x={mid - 6}
          y={topY + 13}
          width={12}
          height={9}
          rx={1}
          fill="color-mix(in oklch, var(--agent-codegen) 72%, #000 12%)"
        />
      </g>
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
  const bodyFp = fp * 0.8
  const accent = VISUAL_ACCENT[visual]
  const isRunning = visual === "running"
  const isSkipped = visual === "skipped"
  const isFailed = visual === "failed"
  const isSuccess = visual === "success"

  const base = isSkipped
    ? mix(meta.color, "var(--muted)", 24)
    : visual === "idle"
      ? mix(meta.color, "var(--muted)", 58)
      : meta.color

  const apronTop = up(c, 4)
  const body = isoBox(apronTop, bodyFp, bodyFp, def.height)
  const roofBase = up(apronTop, def.height)
  const roofCenter = up(roofBase, 4)
  const litColor = isFailed ? "var(--destructive)" : isRunning ? accent ?? WARM : WARM
  const rows = Math.max(1, Math.round(def.height / 13))

  return (
    <g
      onClick={onSelect}
      style={{ cursor: onSelect ? "pointer" : "default" }}
      opacity={isSkipped ? 0.6 : 1}
    >
      <Shadow c={{ x: c.x, y: c.y + HH * fp * 0.45 }} rx={HW * fp * 1.08} ry={HH * fp * 0.66} />

      {accent && (isRunning || visual === "waiting" || isFailed) && (
        <ellipse
          className={isRunning ? "harbor-beacon" : isFailed ? "harbor-flash" : undefined}
          cx={c.x}
          cy={c.y}
          rx={HW * fp * 1.3}
          ry={HH * fp * 1.25}
          fill={accent}
          opacity={0.18}
        />
      )}

      <IsoBox c={c} du={fp} dv={fp} h={4} color={APRON} />

      <IsoBox
        c={apronTop}
        du={bodyFp}
        dv={bodyFp}
        h={def.height}
        color={base}
        stroke={selected ? accent ?? "var(--signal)" : undefined}
      />

      {!isSkipped && (
        <>
          <Windows face={body.right} rows={rows} cols={4} lit litColor={litColor} />
          <Windows face={body.left} rows={rows} cols={4} lit={false} litColor={litColor} />
        </>
      )}

      <IsoBox
        c={roofBase}
        du={bodyFp * 0.92}
        dv={bodyFp * 0.92}
        h={4}
        color={mix(base, "#000", 70)}
      />

      {def.hasCrane && !isSkipped && (
        <Crane base={roofBase} fp={fp} active={isRunning} />
      )}

      {def.kind === "tower" && (
        <g>
          <line
            x1={roofCenter.x}
            y1={roofCenter.y}
            x2={roofCenter.x}
            y2={roofCenter.y - 16}
            stroke="color-mix(in oklch, var(--foreground) 50%, transparent)"
            strokeWidth={2}
          />
          <circle
            className={isRunning ? "harbor-beacon" : undefined}
            cx={roofCenter.x}
            cy={roofCenter.y - 18}
            r={3}
            fill={accent ?? "var(--signal)"}
          />
        </g>
      )}

      {isSuccess && (
        <g>
          <IsoBox c={{ x: c.x - HW * fp * 0.7, y: c.y + HH * fp * 0.3 }} du={0.34} dv={0.2} h={11} color={meta.color} />
          <IsoBox c={{ x: c.x - HW * fp * 0.4, y: c.y + HH * fp * 0.55 }} du={0.34} dv={0.2} h={14} color={mix(meta.color, "#000", 75)} />
        </g>
      )}

      <g transform={`translate(${roofCenter.x - 11}, ${roofCenter.y - 11})`}>
        <rect
          x={0}
          y={0}
          width={22}
          height={22}
          rx={5}
          fill={mix("var(--card)", accent ?? meta.color, 24)}
          stroke={mix(meta.color, "transparent", 55)}
          strokeWidth={1}
        />
        <g transform="translate(3,3)" style={{ color: isSkipped ? "var(--muted-foreground)" : meta.color }}>
          <Icon size={16} stroke={1.8} />
        </g>
      </g>

      <text
        x={c.x}
        y={c.y + HH * fp + 18}
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
        y={c.y + HH * fp + 31}
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
