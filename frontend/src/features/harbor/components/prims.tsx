import { isoBox, mix, poly, subQuad, type BoxFaces, type Pt } from "../iso"

export function Shadow({
  c,
  rx,
  ry,
  opacity = 0.24,
}: {
  c: Pt
  rx: number
  ry: number
  opacity?: number
}) {
  return <ellipse cx={c.x} cy={c.y} rx={rx} ry={ry} fill="#000" opacity={opacity} />
}

export function IsoBox({
  c,
  du,
  dv,
  h,
  color,
  top,
  left,
  right,
  stroke,
  opacity,
}: {
  c: Pt
  du: number
  dv: number
  h: number
  color: string
  top?: string
  left?: string
  right?: string
  stroke?: string
  opacity?: number
}) {
  const f: BoxFaces = isoBox(c, du, dv, h)
  return (
    <g opacity={opacity}>
      <polygon points={poly(f.left)} fill={left ?? mix(color, "#000", 44)} />
      <polygon points={poly(f.right)} fill={right ?? mix(color, "#000", 60)} />
      <polygon
        points={poly(f.top)}
        fill={top ?? mix(color, "white", 78)}
        stroke={stroke}
        strokeWidth={stroke ? 1 : undefined}
      />
    </g>
  )
}

// Draw window bands + a grid of lit windows on a wall quad.
export function Windows({
  face,
  rows,
  cols,
  lit,
  litColor,
  frame = "color-mix(in oklch, #000 30%, transparent)",
}: {
  face: Pt[]
  rows: number
  cols: number
  lit: boolean
  litColor: string
  frame?: string
}) {
  const cells: { pts: Pt[]; key: string }[] = []
  const padS = 0.12
  const padT = 0.16
  const gw = (1 - padS * 2) / cols
  const gt = (1 - padT * 2) / rows
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const s0 = padS + col * gw + gw * 0.18
      const s1 = padS + col * gw + gw * 0.82
      const t0 = padT + r * gt + gt * 0.18
      const t1 = padT + r * gt + gt * 0.82
      cells.push({ pts: subQuad(face, s0, t0, s1, t1), key: `${r}-${col}` })
    }
  }
  return (
    <g>
      {cells.map((cell, i) => (
        <polygon
          key={cell.key}
          points={poly(cell.pts)}
          fill={lit && (i * 7) % 3 !== 0 ? litColor : frame}
          opacity={lit ? 0.95 : 0.55}
        />
      ))}
    </g>
  )
}
