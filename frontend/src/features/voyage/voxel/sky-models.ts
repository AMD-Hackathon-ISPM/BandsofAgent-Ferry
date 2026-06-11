// Small voxel cloud/bird models baked once to sprites, so the sky dressing
// shares the ferry's voxel look at zero per-frame cost.

import { VoxelGrid, type VoxelModel } from "./voxel-grid"
import { BAKED_YAW } from "./bake"
import {
  createVoxelTarget,
  projectPoint,
  renderVoxels,
  type VoxelCam,
} from "./voxel-render"

const CLOUD_PALETTE = ["#000000", "#2c3a63", "#3b4c7d"]
const BIRD_PALETTE = ["#000000", "#8e9cbd", "#aab9dd"]

/** Project a model's bounds at the baked heading and render it cropped. */
function bakeModelSprite(
  model: VoxelModel,
  zoom: number,
  outline: string | null
): HTMLCanvasElement {
  const probe: VoxelCam = {
    yaw: BAKED_YAW,
    zoom,
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
  for (const x of [0, model.lx]) {
    for (const y of [0, model.ly]) {
      for (const z of [0, model.lz]) {
        const p = projectPoint(x, y, z, probe)
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
    }
  }
  const pad = 2
  const w = Math.ceil(maxX - minX) + pad * 2
  const h = Math.ceil(maxY - minY) + pad * 2
  const t = createVoxelTarget(w, h)
  renderVoxels(t, model, { ...probe, ox: pad - minX, oy: pad - minY }, outline)
  return t.canvas
}

function hash(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x + 1, 374761393) ^
    Math.imul(y + 1, 668265263) ^
    Math.imul(z + 1, 2246822519) ^
    Math.imul(seed + 1, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

/** A blobby union of ellipsoid lobes; lighter tone on the sunlit top. */
function cloudModel(seed: number, lobeCount: number): VoxelModel {
  const lx = 18 + lobeCount * 3
  const ly = 9
  const lz = 6
  const g = new VoxelGrid(lx, ly, lz)
  for (let i = 0; i < lobeCount; i++) {
    const h0 = hash(i, 0, 0, seed)
    const cx = 4 + ((h0 >>> 3) % (lx - 8))
    const cy = 3 + ((h0 >>> 9) % (ly - 5))
    const cz = 1 + ((h0 >>> 15) % 2)
    const rx = 3.4 + ((h0 >>> 20) % 3)
    const ry = 2.4 + ((h0 >>> 24) % 2)
    const rz = 1.7 + ((h0 >>> 27) % 2)
    g.box(0, lx - 1, 0, ly - 1, 0, lz - 1, (x, y, z) => {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      const dz = (z - cz) / rz
      if (dx * dx + dy * dy + dz * dz > 1) return 0
      return z > cz ? 2 : 1
    })
  }
  return g.extract(CLOUD_PALETTE)
}

export function bakeCloudSprites(): HTMLCanvasElement[] {
  // Mixed bake zooms for a near/far size spread.
  return [
    bakeModelSprite(cloudModel(3, 4), 2, null),
    bakeModelSprite(cloudModel(11, 3), 1, null),
    bakeModelSprite(cloudModel(27, 5), 2, null),
  ]
}

/** Three flap frames: wings up / level / down. */
function birdModel(frame: number): VoxelModel {
  const g = new VoxelGrid(8, 5, 4)
  // Body + head + beak.
  g.box(2, 4, 2, 2, 1, 1, 1)
  g.set(5, 2, 1, 2)
  g.set(6, 2, 1, 1)
  if (frame === 0) {
    g.set(3, 1, 2, 1)
    g.set(3, 0, 3, 2)
    g.set(3, 3, 2, 1)
    g.set(3, 4, 3, 2)
  } else if (frame === 1) {
    g.set(3, 1, 1, 1)
    g.set(3, 0, 1, 2)
    g.set(3, 3, 1, 1)
    g.set(3, 4, 1, 2)
  } else {
    g.set(3, 1, 0, 1)
    g.set(3, 0, 0, 2)
    g.set(3, 3, 0, 1)
    g.set(3, 4, 0, 2)
  }
  return g.extract(BIRD_PALETTE)
}

export function bakeBirdSprites(): HTMLCanvasElement[] {
  return [0, 1, 2].map((f) => bakeModelSprite(birdModel(f), 1, null))
}
