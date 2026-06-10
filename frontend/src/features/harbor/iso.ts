export const TILE_W = 96
export const TILE_H = 48
export const HW = TILE_W / 2
export const HH = TILE_H / 2

export interface Pt {
  x: number
  y: number
}

export function isoToScreen(gx: number, gy: number): Pt {
  return { x: (gx - gy) * HW, y: (gx + gy) * HH }
}

function r(n: number): number {
  return Math.round(n * 100) / 100
}

export function poly(points: Pt[]): string {
  return points.map((p) => `${r(p.x)},${r(p.y)}`).join(" ")
}

export function mix(color: string, other: string, pct: number): string {
  return `color-mix(in oklch, ${color} ${pct}%, ${other})`
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function along(from: Pt, to: Pt, t: number, lift = 26): Pt {
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t) - lift * Math.sin(Math.PI * Math.min(1, Math.max(0, t))),
  }
}

export function tileDiamond(c: Pt, scale = 1): Pt[] {
  const hw = HW * scale
  const hh = HH * scale
  return [
    { x: c.x, y: c.y - hh },
    { x: c.x + hw, y: c.y },
    { x: c.x, y: c.y + hh },
    { x: c.x - hw, y: c.y },
  ]
}

export interface BoxFaces {
  top: Pt[]
  left: Pt[]
  right: Pt[]
}

export function isoBox(center: Pt, du: number, dv: number, h: number): BoxFaces {
  const axx = HW
  const axy = HH
  const ayx = -HW
  const ayy = HH
  const halfx = (du * axx + dv * ayx) / 2
  const halfy = (du * axy + dv * ayy) / 2
  const o: Pt = { x: center.x - halfx, y: center.y - halfy }
  const g = (u: number, v: number): Pt => ({
    x: o.x + u * axx + v * ayx,
    y: o.y + u * axy + v * ayy,
  })
  const c00 = g(0, 0)
  const c10 = g(du, 0)
  const c11 = g(du, dv)
  const c01 = g(0, dv)
  const up = (p: Pt): Pt => ({ x: p.x, y: p.y - h })
  return {
    top: [up(c00), up(c10), up(c11), up(c01)],
    right: [up(c10), up(c11), c11, c10],
    left: [up(c01), up(c11), c11, c01],
  }
}

// Bilinear point on a quad [A(top-left), B(top-right), C(bottom-right), D(bottom-left)].
export function quadPoint(q: Pt[], s: number, t: number): Pt {
  const [a, b, c, d] = q
  const top = { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }
  const bot = { x: d.x + (c.x - d.x) * s, y: d.y + (c.y - d.y) * s }
  return { x: top.x + (bot.x - top.x) * t, y: top.y + (bot.y - top.y) * t }
}

export function subQuad(
  q: Pt[],
  s0: number,
  t0: number,
  s1: number,
  t1: number,
): Pt[] {
  return [
    quadPoint(q, s0, t0),
    quadPoint(q, s1, t0),
    quadPoint(q, s1, t1),
    quadPoint(q, s0, t1),
  ]
}

export function boxFaces(c: Pt, height: number, scale = 1): BoxFaces {
  const hw = HW * scale
  const hh = HH * scale
  const top: Pt[] = [
    { x: c.x, y: c.y - hh - height },
    { x: c.x + hw, y: c.y - height },
    { x: c.x, y: c.y + hh - height },
    { x: c.x - hw, y: c.y - height },
  ]
  const left: Pt[] = [
    { x: c.x - hw, y: c.y - height },
    { x: c.x, y: c.y + hh - height },
    { x: c.x, y: c.y + hh },
    { x: c.x - hw, y: c.y },
  ]
  const right: Pt[] = [
    { x: c.x, y: c.y + hh - height },
    { x: c.x + hw, y: c.y - height },
    { x: c.x + hw, y: c.y },
    { x: c.x, y: c.y + hh },
  ]
  return { top, left, right }
}
