// Bakes the ship's interior cross-section (Fallout-Shelter-style) per zoom
// level: solid hull silhouette, deck lines, then the furnished rooms
// (back walls, windows, floors, lights, furniture, crew, label chips — see
// ./interior-art), and finally the silhouette outline. The live voxel shell
// fades out above this during the reveal.

import { getHullProfile } from "./hull-profile"
import { ROOMS } from "./rooms"
import { paintRoom } from "./interior-art"

/** Model-space pivot z the cutaway camera centers on (mid-silhouette). */
export const CUTAWAY_PZ = 11.5

const BG_STRUCTURE = "#1c2747"
const WALL = "#0e1730"
const DECK_LINE = "#3a4d78"

/** Cell occupancy in screen orientation (bow left, z up). */
function occ(
  p: ReturnType<typeof getHullProfile>,
  x: number,
  z: number
): boolean {
  if (x < 0 || x >= p.lx || z < 0 || z >= p.lz) return false
  return p.occupancy[z * p.lx + x] === 1
}

function bakeInterior(zoom: number): HTMLCanvasElement {
  const p = getHullProfile()
  const c = document.createElement("canvas")
  c.width = p.lx * zoom
  c.height = p.lz * zoom
  const ctx = c.getContext("2d")!

  const cellX = (x: number) => (p.lx - 1 - x) * zoom // bow on the left
  const cellY = (z: number) => (p.lz - 1 - z) * zoom

  // Solid hull silhouette.
  ctx.fillStyle = BG_STRUCTURE
  for (let z = 0; z < p.lz; z++) {
    for (let x = 0; x < p.lx; x++) {
      if (occ(p, x, z)) ctx.fillRect(cellX(x), cellY(z), zoom, zoom)
    }
  }

  // Deck lines: main deck top and the cabin rooflines, drawn where the
  // structure continues above.
  ctx.fillStyle = DECK_LINE
  for (const zTop of [p.hullTopZ, 11, 16]) {
    for (let x = 0; x < p.lx; x++) {
      if (occ(p, x, zTop)) ctx.fillRect(cellX(x), cellY(zTop), zoom, 1)
    }
  }

  for (const room of ROOMS) paintRoom(ctx, p, room, zoom)

  // Silhouette outline: any occupied cell edge facing empty space.
  ctx.fillStyle = WALL
  for (let z = 0; z < p.lz; z++) {
    for (let x = 0; x < p.lx; x++) {
      if (!occ(p, x, z)) continue
      const cx = cellX(x)
      const cy = cellY(z)
      if (!occ(p, x + 1, z)) ctx.fillRect(cx, cy, 1, zoom)
      if (!occ(p, x - 1, z)) ctx.fillRect(cx + zoom - 1, cy, 1, zoom)
      if (!occ(p, x, z + 1)) ctx.fillRect(cx, cy, zoom, 1)
      if (!occ(p, x, z - 1)) ctx.fillRect(cx, cy + zoom - 1, zoom, 1)
    }
  }

  return c
}

const interiorCache = new Map<number, HTMLCanvasElement>()

export function getInteriorCanvas(zoom: number): HTMLCanvasElement {
  let c = interiorCache.get(zoom)
  if (!c) {
    c = bakeInterior(zoom)
    interiorCache.set(zoom, c)
  }
  return c
}
