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
const SEA_DEEP = "#10192f"
const SEA_SHALLOW = "#1a2a4d"
const CREST = "#31456e"
const CREST_DIM = "#26375a"
const SPARKLE = "#5d76a8"
const TROUGH = "#101b36"
const FOAM = "#dfe9fb"
const FOAM_DIM = "#8fa3cf"
const SWELL_W = 64
const SWELL_H = 32
const CAP_PERIOD = 4
const CAP_WINDOW = 0.36
const CAP_SEED = 17
const CAP_RATE = 0.62
const CAP_MOD = 41

// Depth gradient stops (deep → base → shallow), parsed to rgb once. The depth
// field is rendered to a tiny 1px-per-tile canvas and bilinear-upscaled into
// the buffer, so the colour transitions read as a smooth gradient instead of
// hard tile bands.
function hexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}
const DEEP_RGB = hexRgb(SEA_DEEP)
const BASE_RGB = hexRgb(SEA_BASE)
const SHALLOW_RGB = hexRgb(SEA_SHALLOW)

// Reused offscreen depth field (one pixel per sea tile); recreated on resize.
let depthCanvas: HTMLCanvasElement | null = null
let depthCtx: CanvasRenderingContext2D | null = null
let depthImg: ImageData | null = null
function ensureDepth(cols: number, rows: number) {
  if (!depthCanvas) {
    depthCanvas = document.createElement("canvas")
    depthCtx = depthCanvas.getContext("2d")!
  }
  if (depthCanvas.width !== cols || depthCanvas.height !== rows) {
    depthCanvas.width = cols
    depthCanvas.height = rows
    depthImg = depthCtx!.createImageData(cols, rows)
  }
}

export function hash2(x: number, y: number, seed = 0): number {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(seed + 1, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

export function hash01(x: number, y: number, seed = 0): number {
  return hash2(x, y, seed) / 0x100000000
}

function tileCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = TILE_W
  c.height = TILE_H
  return [c, c.getContext("2d")!]
}

function swellCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = SWELL_W
  c.height = SWELL_H
  const ctx = c.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  return [c, ctx]
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
export type SwellTiles = HTMLCanvasElement[]

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

export function makeSwellTiles(): SwellTiles {
  const variants: HTMLCanvasElement[] = []
  for (let v = 0; v < 4; v++) {
    const [c, ctx] = swellCanvas()
    const y0 = 23 - (v % 3) * 3
    const x0 = 4 + ((v * 7) % 12)
    const len = 38 + v * 4
    for (let i = 0; i < len; i++) {
      if ((i + v) % 5 === 0) continue
      const x = x0 + i
      const y = y0 - Math.floor(i / 2)
      if (x < 0 || x >= SWELL_W || y < 1 || y >= SWELL_H - 1) continue
      ctx.fillStyle = i % 3 === 0 ? "rgba(49,69,110,0.42)" : "rgba(38,55,90,0.5)"
      ctx.fillRect(x, y, 1, 1)
      if ((i + v) % 4 === 0) {
        ctx.fillStyle = "rgba(16,27,54,0.48)"
        ctx.fillRect(x, y + 1, 1, 1)
      }
    }
    variants.push(c)
  }
  return variants
}

/** Low-frequency depth noise at world tile coords, range ≈ −3..3. */
function depthNoise(wx: number, wy: number, t: number): number {
  return (
    Math.sin(wx * 0.15 + t * 0.2) +
    Math.sin(wy * 0.11 - t * 0.13) +
    Math.sin((wx + wy) * 0.07 + t * 0.09)
  )
}

/** Continuous lerp of the depth noise across DEEP → BASE → SHALLOW into `out`. */
function depthRgb(v: number, out: [number, number, number]) {
  const t = clamp01((v + 3) / 6)
  if (t < 0.5) {
    const k = t * 2
    out[0] = DEEP_RGB[0] + (BASE_RGB[0] - DEEP_RGB[0]) * k
    out[1] = DEEP_RGB[1] + (BASE_RGB[1] - DEEP_RGB[1]) * k
    out[2] = DEEP_RGB[2] + (BASE_RGB[2] - DEEP_RGB[2]) * k
  } else {
    const k = (t - 0.5) * 2
    out[0] = BASE_RGB[0] + (SHALLOW_RGB[0] - BASE_RGB[0]) * k
    out[1] = BASE_RGB[1] + (SHALLOW_RGB[1] - BASE_RGB[1]) * k
    out[2] = BASE_RGB[2] + (SHALLOW_RGB[2] - BASE_RGB[2]) * k
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
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
  const speed = clamp01(s.speed)
  const chopSkip = 38 + (1 - speed) * 30

  // Depth gradient: fill a 1px-per-tile field then bilinear-upscale it so the
  // colour ramp is smooth, not a grid of hard tile bands.
  ensureDepth(cols, rows)
  const data = depthImg!.data
  const rgb: [number, number, number] = [0, 0, 0]
  let di = 0
  for (let r = 0; r < rows; r++) {
    const wy = r + baseWy
    for (let c = 0; c < cols; c++) {
      depthRgb(depthNoise(c + baseWx, wy, s.t), rgb)
      data[di] = rgb[0]
      data[di + 1] = rgb[1]
      data[di + 2] = rgb[2]
      data[di + 3] = 255
      di += 4
    }
  }
  depthCtx!.putImageData(depthImg!, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(
    depthCanvas!,
    0,
    0,
    cols,
    rows,
    -offX,
    -offY,
    cols * TILE_W,
    rows * TILE_H
  )
  ctx.imageSmoothingEnabled = false

  const swellSx = Math.floor(s.scrollX * 0.48)
  const swellSy = Math.floor(s.scrollY * 0.48)
  const swellOffX = ((swellSx % SWELL_W) + SWELL_W) % SWELL_W
  const swellOffY = ((swellSy % SWELL_H) + SWELL_H) % SWELL_H
  const swellBaseWx = (swellSx - swellOffX) / SWELL_W
  const swellBaseWy = (swellSy - swellOffY) / SWELL_H
  const swellCols = Math.ceil(s.bufW / SWELL_W) + 2
  const swellRows = Math.ceil(s.bufH / SWELL_H) + 2
  for (let r = 0; r < swellRows; r++) {
    const py = r * SWELL_H - swellOffY
    const wy = r + swellBaseWy
    for (let c = 0; c < swellCols; c++) {
      const px2 = c * SWELL_W - swellOffX
      const wx = c + swellBaseWx
      const h = hash2(wx, wy, 43)
      if (h % 100 < 72) continue
      ctx.globalAlpha = 0.55 + Math.sin(s.t * 0.28 + (h % 19)) * 0.08
      ctx.drawImage(sprites.swell[h % sprites.swell.length], px2, py)
      ctx.globalAlpha = 1
    }
  }

  for (let r = 0; r < rows; r++) {
    const py = r * TILE_H - offY
    const wy = r + baseWy
    for (let c = 0; c < cols; c++) {
      const px2 = c * TILE_W - offX
      const wx = c + baseWx
      const h = hash2(wx, wy)
      if (h % 100 < chopSkip) continue
      const variant = sprites.waves[h % 5]
      ctx.drawImage(variant[(animFrame + h) % 4], px2, py)
      const hc = hash2(wx, wy, CAP_SEED)
      const capPhase = (s.t / CAP_PERIOD + hash01(wx, wy, CAP_SEED + 1)) % 1
      if (
        hc % CAP_MOD === 0 &&
        capPhase < CAP_WINDOW &&
        hash01(wx, wy, CAP_SEED + 2) < CAP_RATE * speed
      ) {
        ctx.drawImage(
          sprites.whitecaps[Math.min(2, Math.floor(capPhase / (CAP_WINDOW / 3)))],
          px2,
          py
        )
      }
    }
  }
}
