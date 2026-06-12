// Bakes an arbitrary voxel model to a cropped iso sprite at the ferry's baked
// heading, returning both the canvas and the sprite-local pixel where the
// model origin (0,0,0) lands. Harbor props share this so they sit in exactly
// the same projection as the at-sea ferry and depth-sort against it.

import { BAKED_YAW, BAKED_ZOOM } from "./bake"
import {
  createVoxelTarget,
  projectPoint,
  renderVoxels,
  type VoxelCam,
} from "./voxel-render"
import type { VoxelModel } from "./voxel-grid"

const OUTLINE = "#0e1730"
const PAD = 2

export interface IsoSprite {
  canvas: HTMLCanvasElement
  /** Sprite-local px of the model origin (0,0,0). */
  anchor: { x: number; y: number }
}

/**
 * Project a model's bounds at the baked heading, render it cropped, and report
 * where its origin projects inside the sprite. `zoom` defaults to the ferry's
 * at-sea zoom so props match the ship's scale.
 */
export function bakeIsoSprite(
  model: VoxelModel,
  zoom: number = BAKED_ZOOM,
  outline: string | null = OUTLINE
): IsoSprite {
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
  const w = Math.ceil(maxX - minX) + PAD * 2
  const h = Math.ceil(maxY - minY) + PAD * 2
  const placed: VoxelCam = { ...probe, ox: PAD - minX, oy: PAD - minY }
  const t = createVoxelTarget(w, h)
  renderVoxels(t, model, placed, outline)
  const origin = projectPoint(0, 0, 0, placed)
  return {
    canvas: t.canvas,
    anchor: { x: Math.round(origin.x), y: Math.round(origin.y) },
  }
}
