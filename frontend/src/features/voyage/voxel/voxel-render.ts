// Tiny software voxel renderer — orthographic, yaw-rotated, 2:1-squashed.
// At yaw = 45° the projection reproduces the iso basis the old hand-stamped
// ferry used: +x (bow) → (+2,-1)·k, +y (starboard) → (+2,+1)·k.
//
// Per frame it rasterizes at most three face-shaped stamps (the top face and
// the two camera-facing sides — under an orthographic camera every face of
// one orientation projects to the same parallelogram), depth-sorts surface
// voxels (cached per yaw), and blits shaded stamps back-to-front into a
// reusable ImageData. No allocation-heavy paths in the hot loop.

import {
  FACE_NX,
  FACE_NY,
  FACE_PX,
  FACE_PY,
  FACE_PZ,
  type VoxelModel,
} from "./voxel-grid"

/** Vertical px per voxel of height, relative to zoom (tuned to the old art). */
export const KZ = 0.55

// View-space light for the side faces; tops are always full-bright. Chosen so
// the baked 45° heading keeps the old sprite's dark-starboard / light-stern
// read, and the light visibly sweeps across the hull during the inspect spin.
const LIGHT_X = -0.6
const LIGHT_Y = 0.5
const SHADE_BASE = 0.76
const SHADE_SPAN = 0.3

export interface VoxelCam {
  yaw: number
  /** Art pixels per voxel. */
  zoom: number
  /** Where the model-space pivot lands in the target buffer, art px. */
  ox: number
  oy: number
  /** Model-space pivot. */
  px: number
  py: number
  pz: number
  /**
   * Vertical share of the depth axis. 0.5 (default) is the classic 2:1 iso
   * squash; 0 collapses depth entirely — a true orthographic elevation.
   */
  tilt?: number
  /** Vertical px per voxel of height; defaults to KZ. 1 = square voxels. */
  kz?: number
}

export function projectPoint(
  x: number,
  y: number,
  z: number,
  cam: VoxelCam
): { x: number; y: number } {
  const c = Math.cos(cam.yaw)
  const s = Math.sin(cam.yaw)
  const tilt = cam.tilt ?? 0.5
  const kz = cam.kz ?? KZ
  const rx = (x - cam.px) * c + (y - cam.py) * s
  const ry = -(x - cam.px) * s + (y - cam.py) * c
  return {
    x: cam.ox + rx * cam.zoom,
    y: cam.oy + (tilt * ry - kz * (z - cam.pz)) * cam.zoom,
  }
}

export interface VoxelTarget {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  img: ImageData
  u32: Uint32Array
  w: number
  h: number
  /** Back-to-front voxel order, cached for the last rendered camera pose. */
  order: Uint32Array
  orderYaw: number
  orderTilt: number
  orderKz: number
  orderModel: VoxelModel | null
  /** Shaded color per (palette index × 5 faces), rebuilt per frame. */
  lut: Uint32Array
  rgb: Uint8Array
  rgbModel: VoxelModel | null
  edges: number[]
}

export function createVoxelTarget(w: number, h: number): VoxelTarget {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(w, h)
  return {
    canvas,
    ctx,
    img,
    u32: new Uint32Array(img.data.buffer),
    w,
    h,
    order: new Uint32Array(0),
    orderYaw: NaN,
    orderTilt: NaN,
    orderKz: NaN,
    orderModel: null,
    lut: new Uint32Array(0),
    rgb: new Uint8Array(0),
    rgbModel: null,
    edges: [],
  }
}

function parseHex(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function packShaded(r: number, g: number, b: number, f: number): number {
  const rr = Math.min(255, Math.round(r * f))
  const gg = Math.min(255, Math.round(g * f))
  const bb = Math.min(255, Math.round(b * f))
  return (0xff000000 | (bb << 16) | (gg << 8) | rr) >>> 0
}

function shade(nx: number, ny: number): number {
  return SHADE_BASE + SHADE_SPAN * Math.max(0, nx * LIGHT_X + ny * LIGHT_Y)
}

interface Stamp {
  dx: Int16Array
  dy: Int16Array
  n: number
}

/**
 * Rasterize the parallelogram spanned by A and B at offset O into a pixel
 * offset list. Coverage is inflated slightly so floored per-voxel anchors
 * can't open cracks between adjacent faces; painter order keeps the overlap
 * correct.
 */
function rasterStamp(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ox: number,
  oy: number
): Stamp {
  const EPS = 0.25
  const det = ax * by - ay * bx
  const dx: number[] = []
  const dy: number[] = []
  if (Math.abs(det) > 1e-6) {
    const xs = [ox, ox + ax, ox + bx, ox + ax + bx]
    const ys = [oy, oy + ay, oy + by, oy + ay + by]
    const x0 = Math.floor(Math.min(...xs)) - 1
    const x1 = Math.ceil(Math.max(...xs)) + 1
    const y0 = Math.floor(Math.min(...ys)) - 1
    const y1 = Math.ceil(Math.max(...ys)) + 1
    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        const px = ix + 0.5 - ox
        const py = iy + 0.5 - oy
        const a = (px * by - py * bx) / det
        const b = (ax * py - ay * px) / det
        if (a >= -EPS && a <= 1 + EPS && b >= -EPS && b <= 1 + EPS) {
          dx.push(ix)
          dy.push(iy)
        }
      }
    }
  }
  return { dx: Int16Array.from(dx), dy: Int16Array.from(dy), n: dx.length }
}

function blitStamp(
  t: VoxelTarget,
  st: Stamp,
  bx: number,
  by: number,
  col: number
) {
  const { w, h, u32 } = t
  for (let k = 0; k < st.n; k++) {
    const x = bx + st.dx[k]
    if (x < 0 || x >= w) continue
    const y = by + st.dy[k]
    if (y < 0 || y >= h) continue
    u32[y * w + x] = col
  }
}

export function renderVoxels(
  t: VoxelTarget,
  model: VoxelModel,
  cam: VoxelCam,
  outline: string | null
) {
  t.u32.fill(0)

  if (t.rgbModel !== model) {
    const n = model.palette.length
    t.rgb = new Uint8Array(n * 3)
    t.lut = new Uint32Array(n * 5)
    for (let p = 1; p < n; p++) {
      const [r, g, b] = parseHex(model.palette[p])
      t.rgb[p * 3] = r
      t.rgb[p * 3 + 1] = g
      t.rgb[p * 3 + 2] = b
    }
    t.rgbModel = model
  }

  const c = Math.cos(cam.yaw)
  const s = Math.sin(cam.yaw)
  const Z = cam.zoom
  const tilt = cam.tilt ?? 0.5
  const kz = cam.kz ?? KZ
  // Screen deltas for one voxel step along each model axis.
  const exx = c * Z
  const exy = -tilt * s * Z
  const eyx = s * Z
  const eyy = tilt * c * Z
  const ezy = -kz * Z

  // Painter order: key = (kz/tilt)·ry + z, ascending = back to front (at the
  // default pose this is the old 2·KZ·ry + z). The sort tilt is clamped so a
  // flat elevation (tilt → 0) keeps a stable depth order; at that pose only
  // one side face is visible anyway, so cross-column overlap can't happen.
  // Recomputed only when the camera pose actually changes (pan reuses it).
  if (
    t.orderModel !== model ||
    t.orderYaw !== cam.yaw ||
    t.orderTilt !== tilt ||
    t.orderKz !== kz
  ) {
    if (t.order.length !== model.count) t.order = new Uint32Array(model.count)
    const depthScale = kz / Math.max(tilt, 0.05)
    const keys = new Float32Array(model.count)
    const idx: number[] = new Array(model.count)
    for (let i = 0; i < model.count; i++) {
      keys[i] = (-model.xs[i] * s + model.ys[i] * c) * depthScale + model.zs[i]
      idx[i] = i
    }
    idx.sort((a, b) => keys[a] - keys[b])
    t.order.set(idx)
    t.orderYaw = cam.yaw
    t.orderTilt = tilt
    t.orderKz = kz
    t.orderModel = model
  }

  // A side face is visible when its rotated normal points toward the camera
  // (+ry half-space). At most two sides + the top survive.
  const visPX = -s > 1e-4
  const visNX = s > 1e-4
  const visPY = c > 1e-4
  const visNY = -c > 1e-4

  // Per-face brightness LUT for this yaw (light sweeps as the ship spins).
  const bris = [shade(c, -s), shade(-c, s), shade(s, c), shade(-s, -c), 1]
  for (let p = 1; p < model.palette.length; p++) {
    const r = t.rgb[p * 3]
    const g = t.rgb[p * 3 + 1]
    const b = t.rgb[p * 3 + 2]
    for (let f = 0; f < 5; f++) {
      t.lut[p * 5 + f] = packShaded(r, g, b, bris[f])
    }
  }

  const stPX = visPX ? rasterStamp(eyx, eyy, 0, ezy, exx, exy) : null
  const stNX = visNX ? rasterStamp(eyx, eyy, 0, ezy, 0, 0) : null
  const stPY = visPY ? rasterStamp(exx, exy, 0, ezy, eyx, eyy) : null
  const stNY = visNY ? rasterStamp(exx, exy, 0, ezy, 0, 0) : null
  const stTop = rasterStamp(exx, exy, eyx, eyy, 0, ezy)

  const baseX = cam.ox - cam.px * exx - cam.py * eyx
  const baseY = cam.oy - cam.px * exy - cam.py * eyy - cam.pz * ezy

  let minX = t.w
  let minY = t.h
  let maxX = -1
  let maxY = -1

  for (let oi = 0; oi < model.count; oi++) {
    const i = t.order[oi]
    const fm = model.faces[i]
    const x = model.xs[i]
    const y = model.ys[i]
    const z = model.zs[i]
    const bx = Math.round(baseX + x * exx + y * eyx)
    const by = Math.round(baseY + x * exy + y * eyy + z * ezy)
    const ci = model.color[i] * 5
    // Sides first, top last, so the top wins overlap within one voxel.
    if (stPX && fm & FACE_PX) blitStamp(t, stPX, bx, by, t.lut[ci])
    if (stNX && fm & FACE_NX) blitStamp(t, stNX, bx, by, t.lut[ci + 1])
    if (stPY && fm & FACE_PY) blitStamp(t, stPY, bx, by, t.lut[ci + 2])
    if (stNY && fm & FACE_NY) blitStamp(t, stNY, bx, by, t.lut[ci + 3])
    if (fm & FACE_PZ) blitStamp(t, stTop, bx, by, t.lut[ci + 4])
    if (bx < minX) minX = bx
    if (bx > maxX) maxX = bx
    if (by < minY) minY = by
    if (by > maxY) maxY = by
  }

  // Silhouette outline pass, same rule as the old sprite: any opaque pixel
  // with a transparent 4-neighbor becomes the dark line.
  if (outline && maxX >= 0) {
    const pad = Math.ceil(Math.abs(exx) + Math.abs(eyx)) + 2
    const padY =
      Math.ceil(Math.abs(exy) + Math.abs(eyy) + Math.abs(ezy)) + 2
    const x0 = Math.max(0, minX - pad)
    const x1 = Math.min(t.w - 1, maxX + pad)
    const y0 = Math.max(0, minY - padY)
    const y1 = Math.min(t.h - 1, maxY + padY)
    const [or, og, ob] = parseHex(outline)
    const oc = packShaded(or, og, ob, 1)
    const { w, h, u32, edges } = t
    edges.length = 0
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x
        if (!u32[i]) continue
        if (
          x === 0 || !u32[i - 1] ||
          x === w - 1 || !u32[i + 1] ||
          y === 0 || !u32[i - w] ||
          y === h - 1 || !u32[i + w]
        ) {
          edges.push(i)
        }
      }
    }
    for (const i of edges) u32[i] = oc
  }

  t.ctx.putImageData(t.img, 0, 0)
}
