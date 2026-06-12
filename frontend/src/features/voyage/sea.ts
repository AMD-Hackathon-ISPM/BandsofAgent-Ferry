// The moving sea: pre-baked sparse wave tiles scrolled diagonally past the
// fixed ship. Tile variant/frame are picked from a hash of *world* tile
// coordinates so the pattern travels with the water instead of twinkling in
// place. Crests carry a baked highlight/trough ramp — no runtime shading.
//
// The ocean fills the whole frame: there is no sky, horizon or atmosphere —
// the scene reads as a pure isometric top-down stretch of open water.

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

/** 5 wave variants × 4 shimmer frames of sparse crest dashes. */
export type WaveTiles = HTMLCanvasElement[][]

export function makeWaveTiles(): WaveTiles {
  const variants: HTMLCanvasElement[][] = []
  for (let v = 0; v < 5; v++) {
    const frames: HTMLCanvasElement[] = []
    const y0 = 2 + (v % 3) * 2
    const x0 = 1 + ((v * 5) % 7)
    const len = 4 + ((v * 3) % 4)
    for (let f = 0; f < 4; f++) {
      const [c, ctx] = tileCanvas()
      const shift = [0, 1, 2, 1][f]
      const crest = f === 2 ? CREST_DIM : CREST
      for (let i = 0; i < len; i++) {
        const x = x0 + shift + i
        const y = i > len / 2 ? y0 - 1 : y0
        px(ctx, x, y, crest)
        if ((i + v) % 2 === 0) px(ctx, x, y + 1, TROUGH)
      }
      // Short echo dash on the longer variants for a layered swell read.
      if (v >= 3) {
        for (let i = 0; i < 3; i++) {
          px(ctx, ((x0 + 9 + shift + i) % TILE_W), y0 + 3, CREST_DIM)
        }
      }
      if (f === 1) px(ctx, x0 + shift + len, y0 - 2, SPARKLE)
      if (f === 3 && v % 2 === 1) px(ctx, x0 + shift - 1, y0 + 1, SPARKLE)
      frames.push(c)
    }
    variants.push(frames)
  }
  return variants
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

export function drawSea(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites
) {
  ctx.fillStyle = SEA_BASE
  ctx.fillRect(0, 0, s.bufW, s.bufH)

  const sx = Math.floor(s.scrollX)
  const sy = Math.floor(s.scrollY)
  const offX = ((sx % TILE_W) + TILE_W) % TILE_W
  const offY = ((sy % TILE_H) + TILE_H) % TILE_H
  const baseWx = (sx - offX) / TILE_W
  const baseWy = (sy - offY) / TILE_H
  const cols = Math.ceil(s.bufW / TILE_W) + 1
  const rows = Math.ceil(s.bufH / TILE_H) + 1
  const animFrame = Math.floor(s.t * 3)
  const epoch = Math.floor(s.t / 4)
  const capPhase = (s.t / 4) % 1

  for (let r = 0; r < rows; r++) {
    const py = r * TILE_H - offY
    const wy = r + baseWy
    for (let c = 0; c < cols; c++) {
      const px2 = c * TILE_W - offX
      const wx = c + baseWx
      const h = hash2(wx, wy)
      if (h % 100 < 38) continue
      const variant = sprites.waves[h % 5]
      ctx.drawImage(variant[(animFrame + h) % 4], px2, py)
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
}
