// Procedural 3D voxel ferry, replacing the old hand-stamped 2D iso sprite.
// Structure follows the passenger-ferry reference (rounded flared bow, two
// superstructure tiers, lifeboats on davits, big raked funnel, wheelhouse with
// wraparound glass) painted in the voyage scene's existing palette.
//
// Model space: x stern→bow, y port→starboard, z up from the waterline.
// One voxel ≈ one art pixel at the baked at-sea zoom.

import { VoxelGrid, type VoxelModel } from "./voxel-grid"

export const FERRY_LX = 40
export const FERRY_LY = 13
export const FERRY_LZ = 23

/** Hex values match the old ferry palette `F` (and COLORS) in sprites.ts. */
export const FERRY_PALETTE = [
  "#000000", // 0: empty, never drawn
  "#26365b", // 1: hullDark
  "#33466f", // 2: hullMid
  "#4f6bff", // 3: indigo
  "#9aa8c6", // 4: deck
  "#c6d0e6", // 5: deckHi
  "#7e8cab", // 6: deckShade
  "#aab6d2", // 7: cabSide
  "#e8edf8", // 8: cabTop
  "#f4f7fd", // 9: cabTopHi
  "#1b2747", // 10: glass
  "#8e9cbd", // 11: mast
  "#f2c14e", // 12: warm
]

const C = {
  hullDark: 1,
  hullMid: 2,
  indigo: 3,
  deck: 4,
  deckHi: 5,
  deckShade: 6,
  cabSide: 7,
  cabTop: 8,
  cabTopHi: 9,
  glass: 10,
  mast: 11,
  warm: 12,
}

/** z of the top hull layer; the deck is its top face. */
export const HULL_TOP = 5

/** Sprite/scene registration points, in model space. */
export const FERRY_ANCHOR_3D = { x: 20, y: 6, z: HULL_TOP }
export const FERRY_STERN_3D = { x: 0, y: 6, z: 0 }
/** Pivot the inspection camera spins around. */
export const FERRY_CENTER_3D = { x: 20, y: 6, z: 8 }

/** Hull half-beam per x slice: rounded stern, long midbody, flared bow. */
function halfBeam(x: number): number {
  if (x < 0 || x >= FERRY_LX) return -1
  if (x === 0) return 4
  if (x === 1) return 5
  if (x >= 31) {
    const t = (x - 31) / 9
    return Math.max(1, Math.floor(6 * (1 - Math.pow(t, 1.6))))
  }
  return 6
}

function hullColor(x: number, y: number, z: number, hb: number): number {
  if (z === HULL_TOP) {
    // Deck layer: pale gunwale ring, grey planking, dither toward starboard
    // (same treatment the old sprite baked into its deck ramp).
    const dy = Math.abs(y - 6)
    const edge =
      dy === hb ||
      x === 0 ||
      x === FERRY_LX - 1 ||
      dy > halfBeam(x - 1) ||
      dy > halfBeam(x + 1)
    if (edge) return C.deckHi
    if (y - 6 >= hb - 2 && (x + y) % 2 === 0) return C.deckShade
    return C.deck
  }
  if (z === 3 || z === 4) return C.indigo // company stripe
  if (z === 0) return C.hullDark // waterline band
  return C.hullMid
}

function buildFerryGrid(): VoxelGrid {
  const g = new VoxelGrid(FERRY_LX, FERRY_LY, FERRY_LZ)

  // Hull with per-slice beam (taper handles bow flare + rounded stern).
  for (let x = 0; x < FERRY_LX; x++) {
    const hb = halfBeam(x)
    for (let y = 6 - hb; y <= 6 + hb; y++) {
      for (let z = 0; z <= HULL_TOP; z++) {
        g.set(x, y, z, hullColor(x, y, z, hb))
      }
    }
  }

  // Stern cargo door + bow anchor recesses, drawn into the hull plating.
  g.box(0, 0, 4, 8, 1, 4, C.deckShade)
  g.set(36, 6 - halfBeam(36), 2, C.hullDark)
  g.set(36, 6 + halfBeam(36), 2, C.hullDark)

  // Bulwark rail along the open fore/aft decks.
  for (let x = 0; x < FERRY_LX; x++) {
    if (x > 4 && x < 29) continue
    const hb = halfBeam(x)
    g.set(x, 6 - hb, HULL_TOP + 1, C.mast)
    g.set(x, 6 + hb, HULL_TOP + 1, C.mast)
  }
  for (let y = 6 - halfBeam(0); y <= 6 + halfBeam(0); y++) {
    g.set(0, y, HULL_TOP + 1, C.mast)
  }
  g.set(FERRY_LX - 1, 6, HULL_TOP + 1, C.mast)

  // Tier 1: main cabin with a mullioned window band.
  g.box(5, 28, 2, 10, 6, 10, (x, _y, z) => {
    if (z === 8 || z === 9) return x % 3 === 0 ? C.cabSide : C.glass
    return C.cabSide
  })
  // Tier 1 roof, one voxel of overhang, highlight toward port/bow.
  g.box(4, 29, 1, 11, 11, 11, (x, y) =>
    y === 1 || x >= 28 ? C.cabTopHi : C.cabTop
  )
  // Promenade rail around the tier-1 roof.
  g.box(4, 29, 1, 11, 12, 12, (x, y) =>
    y === 1 || y === 11 || x === 4 || x === 29 ? C.mast : 0
  )

  // Lifeboats on davits, hung outboard of the tier-1 roof. Warm accent —
  // the reference ferry's orange boats, in this scene's palette.
  for (const y of [0, 12]) {
    g.box(11, 14, y, y, 11, 12, C.warm)
    g.box(18, 21, y, y, 11, 12, C.warm)
    for (const x of [10, 15, 17, 22]) g.set(x, y, 12, C.mast)
  }

  // Tier 2: upper cabin, set back, with its own window band.
  g.box(8, 24, 3, 9, 12, 15, (x, _y, z) => {
    if (z === 13 || z === 14) return x % 3 === 1 ? C.cabSide : C.glass
    return C.cabSide
  })
  // Tier 2 roof.
  g.box(7, 25, 2, 10, 16, 16, (x, y) =>
    y === 2 || x >= 24 ? C.cabTopHi : C.cabTop
  )

  // Wheelhouse forward on the top tier: wraparound glass, corner posts.
  g.box(17, 24, 3, 9, 17, 19, (x, y, z) => {
    if (z >= 18) {
      const corner = (x === 17 || x === 24) && (y === 3 || y === 9)
      return corner ? C.cabSide : C.glass
    }
    return C.cabSide
  })
  // Wheelhouse roof + bridge wings spanning the full beam.
  g.box(16, 25, 2, 10, 20, 20, C.cabTopHi)
  g.box(20, 22, 0, 12, 17, 17, C.deckHi)

  // Big raked funnel aft on the tier-2 roof: white body, indigo cap, dark
  // exhaust opening on top.
  g.box(9, 13, 4, 8, 16, 17, C.cabTop)
  g.box(8, 12, 4, 8, 18, 18, C.cabTop)
  g.box(8, 12, 4, 8, 19, 20, C.indigo)
  g.box(9, 11, 5, 7, 20, 20, C.glass)

  // Foremast with crossbar and masthead light.
  g.box(34, 34, 6, 6, 6, 12, C.mast)
  g.box(34, 34, 4, 8, 11, 11, C.mast)
  g.set(34, 6, 13, C.warm)

  // Aft flag pole.
  g.box(1, 1, 6, 6, 6, 9, C.mast)
  g.set(1, 6, 10, C.warm)

  // Radar mast on the wheelhouse roof.
  g.set(20, 6, 21, C.mast)
  g.box(19, 21, 6, 6, 22, 22, C.mast)

  return g
}

let cached: VoxelModel | null = null

export function getFerryModel(): VoxelModel {
  if (!cached) cached = buildFerryGrid().extract(FERRY_PALETTE)
  return cached
}
