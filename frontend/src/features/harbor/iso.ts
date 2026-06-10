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
