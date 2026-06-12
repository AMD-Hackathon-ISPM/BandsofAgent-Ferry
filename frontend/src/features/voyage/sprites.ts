// HD-2D pixel sprites for the voyage scene, authored in code and baked once
// to offscreen canvases. All shading and shadows are baked into the palettes
// (tone ramps + checkerboard dither) — nothing is lit at runtime, so drawing
// a "shaded" sprite costs the same as a flat one.

import { makeWaveTiles, makeWhitecaps, type WaveTiles } from "./sea"
import { bakeFerrySprites, FERRY_GEOM } from "./voxel/bake"
import { getFerryModel } from "./voxel/ferry-model"
import type { VoxelModel } from "./voxel/voxel-grid"

export const COLORS = {
  seaBase: "#15223f",
  shadow: "#0b1428",
  outline: "#0e1730",
}

export interface SpriteDef {
  palette: Record<string, string>
  rows: string[]
}

export function bakeSprite(def: SpriteDef): HTMLCanvasElement {
  const h = def.rows.length
  const w = Math.max(...def.rows.map((r) => r.length))
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")!
  for (let y = 0; y < h; y++) {
    const row = def.rows[y]
    for (let x = 0; x < row.length; x++) {
      const color = def.palette[row[x]]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    }
  }
  return c
}

// --- Ferry ----------------------------------------------------------------
// The ferry is a 3D voxel model (see ./voxel) software-rendered at the
// classic 2:1 iso heading and baked to static frames here — at-sea drawing
// stays a plain blit. The inspect mode re-renders the same model live at
// arbitrary yaw/zoom. Sprite geometry is pure projection math, so the
// constants below stay module-level like the old hand-tuned ones.

export const FERRY_W = FERRY_GEOM.w
export const FERRY_H = FERRY_GEOM.h
/** Sprite-local point that should sit at the scene's ship anchor. */
export const FERRY_ANCHOR = FERRY_GEOM.anchor
/** Sprite-local stern waterline, where the wake spawns. */
export const FERRY_STERN = FERRY_GEOM.stern

// --- Hand-authored string sprites ------------------------------------------

const FOAM_PAL = { f: "#dfe9fb", g: "#8fa3cf" }

const FOAM_FRAMES: SpriteDef[] = [
  { palette: FOAM_PAL, rows: [".ffff.", "ffffff", ".ffff."] },
  { palette: FOAM_PAL, rows: [".fff.", "ff..ff", ".f..f."] },
  { palette: FOAM_PAL, rows: ["g.g.g", ".g.g."] },
]

// --- Pixel-art drawing helpers (shared with the harbor scene) ----------------

export function makeArtCanvas(
  w: number,
  h: number
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  return [c, ctx]
}

export function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

export function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string
) {
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x1 + 0.5, y1 + 0.5)
  ctx.lineTo(x2 + 0.5, y2 + 0.5)
  ctx.stroke()
}

// --- Bake everything --------------------------------------------------------

export interface Sprites {
  ferry: HTMLCanvasElement[]
  ferryShadow: HTMLCanvasElement
  /** Surface voxels of the ferry, for the live inspect-mode renderer. */
  ferryModel: VoxelModel
  foam: HTMLCanvasElement[]
  waves: WaveTiles
  whitecaps: HTMLCanvasElement[]
}

export function bakeSprites(): Sprites {
  const ferryBake = bakeFerrySprites()
  return {
    ferry: ferryBake.frames,
    ferryShadow: ferryBake.shadow,
    ferryModel: getFerryModel(),
    foam: FOAM_FRAMES.map(bakeSprite),
    waves: makeWaveTiles(),
    whitecaps: makeWhitecaps(),
  }
}
