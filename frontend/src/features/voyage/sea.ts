// The moving sea: pre-baked sparse wave tiles scrolled diagonally past the
// fixed ship. Tile variant/frame are picked from a hash of *world* tile
// coordinates so the pattern travels with the water instead of twinkling in
// place. Crests carry a baked highlight/trough ramp — no runtime shading.

import type { SceneState } from "./scene"
import type { Sprites } from "./sprites"

export const TILE_W = 16
export const TILE_H = 8

/** Sea scroll speed in art px/s; 2:1 so the drift matches the iso heading. */
export const SEA_VX = 42
export const SEA_VY = 21

const SEA_BASE = "#15223f"
const CREST = "#31456e"
const CREST_DIM = "#26375a"
const SPARKLE = "#5d76a8"
const TROUGH = "#101b36"
const FOAM = "#dfe9fb"
const FOAM_DIM = "#8fa3cf"
/** Atmosphere color distant rows fade toward. */
const HAZE = "#27365c"
const SKY = "#111a33"
const HORIZON = "#2e3f68"

/** Rows closer to the horizon than this fraction use the hazed far tiles. */
const FAR_BAND = 0.3

function lerpHex(a: string, b: string, t: number): string {
  const av = parseInt(a.slice(1), 16)
  const bv = parseInt(b.slice(1), 16)
  const ch = (sh: number) => {
    const x = (av >> sh) & 255
    const y = (bv >> sh) & 255
    return Math.round(x + (y - x) * t)
  }
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`
}

export function hash2(x: number, y: number, seed = 0): number {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(seed + 1, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

function tileCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = TILE_W
  c.height = TILE_H
  return [c, c.getContext("2d")!]
}

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
) {
  if (x < 0 || x >= TILE_W || y < 0 || y >= TILE_H) return
  ctx.fillStyle = color
  ctx.fillRect(x, y, 1, 1)
}

export interface WaveTiles {
  near: HTMLCanvasElement[][]
  far: HTMLCanvasElement[][]
}

/**
 * 5 wave variants × 4 shimmer frames of sparse crest dashes, baked twice:
 * full-contrast `near` tiles and `far` tiles washed toward the haze color
 * for the rows just under the horizon.
 */
export function makeWaveTiles(): WaveTiles {
  const bake = (wash: number): HTMLCanvasElement[][] => {
    const crestC = lerpHex(CREST, HAZE, wash)
    const crestDimC = lerpHex(CREST_DIM, HAZE, wash)
    const sparkleC = lerpHex(SPARKLE, HAZE, wash)
    const troughC = lerpHex(TROUGH, HAZE, wash * 0.6)
    const variants: HTMLCanvasElement[][] = []
    for (let v = 0; v < 5; v++) {
      const frames: HTMLCanvasElement[] = []
      const y0 = 2 + (v % 3) * 2
      const x0 = 1 + ((v * 5) % 7)
      const len = 4 + ((v * 3) % 4)
      for (let f = 0; f < 4; f++) {
        const [c, ctx] = tileCanvas()
        const shift = [0, 1, 2, 1][f]
        const crest = f === 2 ? crestDimC : crestC
        for (let i = 0; i < len; i++) {
          const x = x0 + shift + i
          const y = i > len / 2 ? y0 - 1 : y0
          px(ctx, x, y, crest)
          if ((i + v) % 2 === 0) px(ctx, x, y + 1, troughC)
        }
        // Short echo dash on the longer variants for a layered swell read.
        if (v >= 3) {
          for (let i = 0; i < 3; i++) {
            px(ctx, ((x0 + 9 + shift + i) % TILE_W), y0 + 3, crestDimC)
          }
        }
        if (f === 1) px(ctx, x0 + shift + len, y0 - 2, sparkleC)
        if (f === 3 && v % 2 === 1) px(ctx, x0 + shift - 1, y0 + 1, sparkleC)
        frames.push(c)
      }
      variants.push(frames)
    }
    return variants
  }
  return { near: bake(0), far: bake(0.45) }
}

/**
 * 64×6 dithered atmosphere band replacing the hard 1px horizon line:
 * sky blends through the horizon blue into the sea base.
 */
export function makeHorizonHaze(): HTMLCanvasElement {
  const w = 64
  const h = 6
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")!
  // Per-row blend target and dither density toward the row's color.
  const rows: Array<[string, string, number]> = [
    [SKY, lerpHex(SKY, HORIZON, 0.4), 0.3],
    [SKY, lerpHex(SKY, HORIZON, 0.65), 0.55],
    [lerpHex(SKY, HORIZON, 0.8), HORIZON, 0.6],
    [HORIZON, lerpHex(HORIZON, SEA_BASE, 0.5), 0.4],
    [SEA_BASE, lerpHex(HORIZON, SEA_BASE, 0.45), 0.5],
    [SEA_BASE, lerpHex(HORIZON, SEA_BASE, 0.7), 0.3],
  ]
  for (let y = 0; y < h; y++) {
    const [base, accent, density] = rows[y]
    for (let x = 0; x < w; x++) {
      const speckle = (hash2(x, y, 91) % 100) / 100
      ctx.fillStyle = speckle < density ? accent : base
      ctx.fillRect(x, y, 1, 1)
    }
  }
  return c
}

/** 3-frame breaking whitecap overlay. */
export function makeWhitecaps(): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = []
  const draw = [
    (ctx: CanvasRenderingContext2D) => {
      for (let i = 0; i < 3; i++) px(ctx, 5 + i, 3, FOAM)
    },
    (ctx: CanvasRenderingContext2D) => {
      for (let i = 0; i < 6; i++) px(ctx, 4 + i, 3, FOAM)
      px(ctx, 3, 4, FOAM_DIM)
      px(ctx, 10, 4, FOAM_DIM)
    },
    (ctx: CanvasRenderingContext2D) => {
      px(ctx, 4, 3, FOAM_DIM)
      px(ctx, 7, 4, FOAM_DIM)
      px(ctx, 10, 3, FOAM_DIM)
    },
  ]
  for (const d of draw) {
    const [c, ctx] = tileCanvas()
    d(ctx)
    frames.push(c)
  }
  return frames
}

export function horizonY(bufH: number): number {
  return Math.floor(bufH * 0.22)
}

export function drawSea(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites
) {
  const hy = horizonY(s.bufH)
  ctx.fillStyle = SEA_BASE
  ctx.fillRect(0, hy + 1, s.bufW, s.bufH - hy - 1)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, hy + 1, s.bufW, s.bufH - hy - 1)
  ctx.clip()

  const sx = Math.floor(s.scrollX)
  const sy = Math.floor(s.scrollY)
  const offX = ((sx % TILE_W) + TILE_W) % TILE_W
  const offY = ((sy % TILE_H) + TILE_H) % TILE_H
  const baseWx = (sx - offX) / TILE_W
  const baseWy = (sy - offY) / TILE_H
  const cols = Math.ceil(s.bufW / TILE_W) + 1
  const rows = Math.ceil((s.bufH - hy) / TILE_H) + 1
  const animFrame = Math.floor(s.t * 3)
  const epoch = Math.floor(s.t / 4)
  const capPhase = (s.t / 4) % 1

  const seaH = Math.max(1, s.bufH - hy)

  for (let r = 0; r < rows; r++) {
    const py = hy + 1 + r * TILE_H - offY
    const wy = r + baseWy
    // 0 at the horizon, 1 at the bottom edge: picks hazed tiles and thins
    // the crests out with distance.
    const depth = Math.min(1, Math.max(0, (py - hy) / seaH))
    const skip = 38 + Math.max(0, (FAR_BAND - depth) / FAR_BAND) * 26
    const tiles = depth < FAR_BAND ? sprites.waves.far : sprites.waves.near
    for (let c = 0; c < cols; c++) {
      const px2 = c * TILE_W - offX
      const wx = c + baseWx
      const h = hash2(wx, wy)
      if (h % 100 < skip) continue
      const variant = tiles[h % 5]
      ctx.drawImage(variant[(animFrame + h) % 4], px2, py)
      // No breaking caps in the hazed distance.
      if (depth < 0.25) continue
      const hc = hash2(wx, wy, epoch + 7)
      if (hc % 23 === 0 && capPhase < 0.45) {
        ctx.drawImage(
          sprites.whitecaps[Math.min(2, Math.floor(capPhase / 0.15))],
          px2,
          py
        )
      }
    }
  }

  // Cheap depth wash: three translucent bands hug the horizon.
  const bands: Array<[number, number, number]> = [
    [1, 4, 0.22],
    [5, 5, 0.13],
    [10, 6, 0.07],
  ]
  for (const [off, bh, alpha] of bands) {
    ctx.fillStyle = `rgba(39, 54, 92, ${alpha})`
    ctx.fillRect(0, hy + off, s.bufW, bh)
  }
  ctx.restore()
}
