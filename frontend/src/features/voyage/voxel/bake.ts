// Bakes the voxel ferry into the static at-sea sprite frames the render loop
// blits today — the 3D model costs nothing per frame while sailing. The
// sprite geometry (size + anchor points) is pure projection math so it can be
// exported as module constants without touching the DOM.

import {
  FERRY_ANCHOR_3D,
  FERRY_LX,
  FERRY_LY,
  FERRY_LZ,
  FERRY_STERN_3D,
  getFerryModel,
} from "./ferry-model"
import {
  createVoxelTarget,
  projectPoint,
  renderVoxels,
  type VoxelCam,
} from "./voxel-render"

/** The classic 2:1 iso heading the old sprite was authored at. */
export const BAKED_YAW = Math.PI / 4
/**
 * The model tripled in resolution (40→120 voxels long); 4/3 keeps the baked
 * at-sea sprite the same screen footprint the 40-voxel ship had at zoom 4.
 * The stamp rasterizer is geometric, so a fractional zoom is fine.
 */
export const BAKED_ZOOM = 4 / 3

// Matches COLORS.outline / COLORS.shadow / F.foam in sprites.ts.
const OUTLINE = "#0e1730"
const SHADOW = "#0b1428"
const FOAM = "#dfe9fb"

const PAD = 2

export interface FerryGeom {
  w: number
  h: number
  anchor: { x: number; y: number }
  stern: { x: number; y: number }
  cam: VoxelCam
}

function computeGeom(): FerryGeom {
  const cam: VoxelCam = {
    yaw: BAKED_YAW,
    zoom: BAKED_ZOOM,
    ox: 0,
    oy: 0,
    px: 0,
    py: 0,
    pz: 0,
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const x of [0, FERRY_LX]) {
    for (const y of [0, FERRY_LY]) {
      for (const z of [0, FERRY_LZ]) {
        const p = projectPoint(x, y, z, cam)
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
    }
  }
  // Origin so all projected points land at [PAD, size - PAD); the extra
  // bottom pad row keeps the waterline foam inside the canvas.
  const ox = PAD - minX
  const oy = PAD - minY
  const placed: VoxelCam = { ...cam, ox, oy }
  const a = projectPoint(
    FERRY_ANCHOR_3D.x,
    FERRY_ANCHOR_3D.y,
    FERRY_ANCHOR_3D.z,
    placed
  )
  const st = projectPoint(
    FERRY_STERN_3D.x,
    FERRY_STERN_3D.y,
    FERRY_STERN_3D.z,
    placed
  )
  return {
    w: Math.ceil(maxX - minX) + PAD * 2,
    h: Math.ceil(maxY - minY) + PAD * 2,
    anchor: { x: Math.round(a.x), y: Math.round(a.y) },
    stern: { x: Math.round(st.x), y: Math.round(st.y) },
    cam: placed,
  }
}

export const FERRY_GEOM = computeGeom()

export interface FerryBake {
  frames: HTMLCanvasElement[]
  shadow: HTMLCanvasElement
}

export function bakeFerrySprites(): FerryBake {
  const { w, h, cam } = FERRY_GEOM
  const t = createVoxelTarget(w, h)
  renderVoxels(t, getFerryModel(), cam, OUTLINE)

  // Bottom-most opaque pixel per column = the waterline contour (the hull
  // bottom is flat at z = 0), where the dithered foam frames go.
  const bottoms = new Int16Array(w).fill(-1)
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) {
      if (t.u32[y * w + x]) {
        bottoms[x] = y
        break
      }
    }
  }

  // Four bob frames: the foam dither crawls along the waterline and the foam
  // band breathes one pixel thicker on the middle frames.
  const frames: HTMLCanvasElement[] = []
  for (let frame = 0; frame < 4; frame++) {
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    const ctx = c.getContext("2d")!
    ctx.drawImage(t.canvas, 0, 0)
    ctx.fillStyle = FOAM
    const thick = frame === 1 || frame === 2
    for (let x = 0; x < w; x++) {
      const yb = bottoms[x]
      if (yb < 0 || yb + 1 >= h) continue
      if ((x + frame) % 4 < 2) ctx.fillRect(x, yb + 1, 1, 1)
      if (thick && yb + 2 < h && (x + frame) % 8 < 2) {
        ctx.fillRect(x, yb + 2, 1, 1)
      }
    }
    frames.push(c)
  }

  // Flat dithered contact shadow: the hull footprint (inflated one voxel)
  // projected onto the z = 0 water plane. Shares the ship sprite's origin so
  // render.ts can keep blitting both at the same position.
  const shadow = document.createElement("canvas")
  shadow.width = w
  shadow.height = h
  const sctx = shadow.getContext("2d")!
  sctx.fillStyle = SHADOW
  const p00 = projectPoint(-1, -1, 0, cam)
  const p10 = projectPoint(FERRY_LX + 1, -1, 0, cam)
  const p01 = projectPoint(-1, FERRY_LY + 1, 0, cam)
  const ax = p10.x - p00.x
  const ay = p10.y - p00.y
  const bx = p01.x - p00.x
  const by = p01.y - p00.y
  const det = ax * by - ay * bx
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x + y) % 2 !== 0) continue
      const px = x + 0.5 - p00.x
      const py = y + 0.5 - p00.y
      const a = (px * by - py * bx) / det
      const b = (ax * py - ay * px) / det
      if (a >= 0 && a <= 1 && b >= 0 && b <= 1) sctx.fillRect(x, y, 1, 1)
    }
  }

  return { frames, shadow }
}
