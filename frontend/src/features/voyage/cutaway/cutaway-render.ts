// Bakes the ship's interior cross-section (Fallout-Shelter-style) per zoom
// level: solid hull silhouette, room compartments clipped to it, deck lines,
// agent-hue ceiling accents, pixel-font labels and the silhouette outline.
// The live voxel shell fades out above this during the reveal.

import { getHullProfile } from "./hull-profile"
import { ROOMS, type RoomDef } from "./rooms"
import { drawPixelText, pixelTextWidth } from "./pixel-font"

/** Model-space pivot z the cutaway camera centers on (mid-silhouette). */
export const CUTAWAY_PZ = 11.5

const BG_STRUCTURE = "#1c2747"
const BG_ROOM = "#283561"
const WALL = "#0e1730"
const DECK_LINE = "#3a4d78"
const LABEL = "#c6d0e6"

let accentCache: Map<string, string> | null = null

function accentColor(varName?: string): string {
  if (!varName) return "#4f6bff"
  if (!accentCache) accentCache = new Map()
  const hit = accentCache.get(varName)
  if (hit) return hit
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  const color = v || "#4f6bff"
  accentCache.set(varName, color)
  return color
}

/** Cell occupancy in screen orientation (bow left, z up). */
function occ(
  p: ReturnType<typeof getHullProfile>,
  x: number,
  z: number
): boolean {
  if (x < 0 || x >= p.lx || z < 0 || z >= p.lz) return false
  return p.occupancy[z * p.lx + x] === 1
}

function inRoom(room: RoomDef, x: number, z: number): boolean {
  return x >= room.x0 && x <= room.x1 && z >= room.z0 && z <= room.z1
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

  for (const room of ROOMS) {
    const region = (x: number, z: number) => inRoom(room, x, z) && occ(p, x, z)

    // Room fill, clipped to the silhouette.
    ctx.fillStyle = BG_ROOM
    for (let z = room.z0; z <= room.z1; z++) {
      for (let x = room.x0; x <= room.x1; x++) {
        if (region(x, z)) ctx.fillRect(cellX(x), cellY(z), zoom, zoom)
      }
    }

    // Walls: 1-art-px edges wherever the region borders anything else.
    ctx.fillStyle = WALL
    for (let z = room.z0; z <= room.z1; z++) {
      for (let x = room.x0; x <= room.x1; x++) {
        if (!region(x, z)) continue
        const cx = cellX(x)
        const cy = cellY(z)
        if (!region(x + 1, z)) ctx.fillRect(cx, cy, 1, zoom) // bow side
        if (!region(x - 1, z)) ctx.fillRect(cx + zoom - 1, cy, 1, zoom)
        if (!region(x, z + 1)) ctx.fillRect(cx, cy, zoom, 1) // ceiling
        if (!region(x, z - 1)) ctx.fillRect(cx, cy + zoom - 1, zoom, 1)
      }
    }

    // Agent-hue accent strip along the inside of the ceiling.
    ctx.fillStyle = accentColor(room.accentVar)
    for (let x = room.x0; x <= room.x1; x++) {
      if (region(x, room.z1) && !region(x, room.z1 + 1)) {
        ctx.fillRect(cellX(x), cellY(room.z1) + 1, zoom, 2)
      }
    }

    // Label, centered; falls back to the first word in tight rooms.
    const rx = cellX(room.x1)
    const rw = (room.x1 - room.x0 + 1) * zoom
    let label = room.label
    if (pixelTextWidth(label) > rw - 6) label = label.split(" ")[0]
    if (pixelTextWidth(label) <= rw - 4) {
      drawPixelText(
        ctx,
        label,
        rx + Math.floor((rw - pixelTextWidth(label)) / 2),
        cellY(room.z1) + 5,
        LABEL
      )
    }
  }

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
