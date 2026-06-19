// The ferry's side silhouette, derived from the voxel model so the cutaway
// rooms stay congruent with the boat forever — edits to ferry-model.ts
// propagate here automatically. Surface extraction keeps the extreme-y voxel
// of every occupied (x, z) column, so projecting xs/zs onto the x–z plane
// yields the complete silhouette.

import { getFerryModel, HULL_TOP } from "../voxel/ferry-model"

export interface HullProfile {
  lx: number
  lz: number
  /** occupancy[z * lx + x] = 1 if any y has a voxel — the side silhouette. */
  occupancy: Uint8Array
  /** Highest occupied z per x column (-1 if empty) — the roofline. */
  topZ: Int16Array
  /** z of the main-deck hull layer. */
  hullTopZ: number
}

let cached: HullProfile | null = null

export function getHullProfile(): HullProfile {
  if (cached) return cached
  const m = getFerryModel()
  const occupancy = new Uint8Array(m.lx * m.lz)
  const topZ = new Int16Array(m.lx).fill(-1)
  for (let i = 0; i < m.count; i++) {
    const x = m.xs[i]
    const z = m.zs[i]
    occupancy[z * m.lx + x] = 1
    if (z > topZ[x]) topZ[x] = z
  }
  cached = { lx: m.lx, lz: m.lz, occupancy, topZ, hullTopZ: HULL_TOP }
  return cached
}
