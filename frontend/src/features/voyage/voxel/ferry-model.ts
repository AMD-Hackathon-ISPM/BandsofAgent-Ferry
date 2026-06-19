// Procedural 3D voxel ferry, replacing the old hand-stamped 2D iso sprite.
// A passenger-ferry reference (rounded flared bow, two lifeboats on davits,
// big raked funnel, wheelhouse with wraparound glass) painted in the voyage
// scene's existing palette.
//
// Model space: x stern→bow, y port→starboard, z up from the waterline.
// Authored at 3 voxels ≈ one art pixel of the old model — the extra
// resolution buys curved plating (raked stem, counter stern, bow flare) and
// deck interiors tall enough for the cutaway's furnished rooms.

import { VoxelGrid, type VoxelModel } from "./voxel-grid"

export const FERRY_LX = 120
export const FERRY_LY = 39
export const FERRY_LZ = 69

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

/** Centerline + widest half-beam. */
const CY = 19
const MAX_HB = 19

/** z of the top hull layer; the main deck is its top face. */
export const HULL_TOP = 17

/**
 * Deck geometry the cutaway derives its rooms and deck lines from. Keeping
 * these next to the voxel painting below means an edit to the superstructure
 * moves the interior layout with it.
 */
export const DECKS = {
  /** Top plating layer of the hull — the main-deck line. */
  hullTop: HULL_TOP,
  /** Tier-1 cabin band (the long main cabin on deck). */
  tier1: { x0: 15, x1: 86, z0: 18, z1: 32 },
  /** Top layer of the tier-1 roof slab — the second deck line. */
  tier1RoofTop: 35,
  /** Tier-2 cabin band. */
  tier2: { x0: 24, x1: 74, z0: 36, z1: 47 },
  /** Top layer of the tier-2 roof slab — the third deck line. */
  tier2RoofTop: 50,
  /** Wheelhouse band. */
  wheel: { x0: 51, x1: 74, z0: 51, z1: 59 },
} as const

/** Sprite/scene registration points, in model space. */
export const FERRY_ANCHOR_3D = { x: 60, y: CY, z: HULL_TOP }
export const FERRY_STERN_3D = { x: 0, y: CY, z: 0 }
/** Pivot the inspection camera spins around. */
export const FERRY_CENTER_3D = { x: 60, y: CY, z: 24 }

/** Where the bow taper begins. */
const BOW_X0 = 92

/**
 * Hull half-beam at (x, z): rounded stern quarter, long midbody, smooth bow
 * taper with flare (the bow widens toward the deck).
 */
function halfBeam(x: number, z: number): number {
  if (x < 0 || x >= FERRY_LX) return -1
  let hb = MAX_HB
  if (x < 9) {
    // Rounded stern quarter.
    const t = (9 - x) / 9
    hb -= 7 * t * t
  }
  if (x >= BOW_X0) {
    const t = (x - BOW_X0) / (FERRY_LX - 1 - BOW_X0)
    hb = Math.min(hb, MAX_HB * (1 - Math.pow(t, 1.7)))
    hb += 2.5 * Math.pow(t, 1.2) * (z / HULL_TOP)
  }
  return Math.max(2, Math.round(Math.min(hb, MAX_HB)))
}

/** Bow x-extent grows with height — the raked stem read in side view. */
function bowEndX(z: number): number {
  return 112 + Math.round(7 * Math.pow(z / HULL_TOP, 1.4))
}

/** The stern tucks under below the main deck — a counter-stern curve. */
function sternStartX(z: number): number {
  if (z >= 8) return 0
  const t = (8 - z) / 8
  return Math.round(4 * t * t)
}

function hullColor(x: number, y: number, z: number): number {
  if (z === HULL_TOP) {
    const hb = halfBeam(x, z)
    const dy = Math.abs(y - CY)
    const edge =
      dy >= hb - 1 ||
      x <= sternStartX(z) + 1 ||
      x >= bowEndX(z) - 1 ||
      dy > halfBeam(x - 1, z) ||
      dy > halfBeam(x + 1, z)
    if (edge) return C.deckHi
    // Plank seams across the open fore/aft decks.
    if (x % 3 === 0 && (x + y) % 2 === 0) return C.deckShade
    return C.deck
  }
  if (z >= 9 && z <= 14) return C.indigo // boot-stripe band
  if (z <= 2) return C.hullDark // waterline shadow
  return C.hullMid
}

function buildFerryGrid(): VoxelGrid {
  const g = new VoxelGrid(FERRY_LX, FERRY_LY, FERRY_LZ)
  const D = DECKS

  // Hull: per (x, z) slice clipped by the raked stem and counter stern, with
  // the beam curve giving the rounded quarter and flared bow.
  for (let x = 0; x < FERRY_LX; x++) {
    for (let z = 0; z <= HULL_TOP; z++) {
      if (x < sternStartX(z) || x > bowEndX(z)) continue
      const hb = halfBeam(x, z)
      for (let y = CY - hb; y <= CY + hb; y++) {
        g.set(x, y, z, hullColor(x, y, z))
      }
    }
  }

  // Stern cargo door, painted onto the transom plating.
  for (let z = 3; z <= 14; z++) {
    const sx = sternStartX(z)
    for (let y = 13; y <= 25; y++) g.set(sx, y, z, C.deckShade)
  }
  // Hawse-hole anchor recesses near the bow.
  for (let z = 6; z <= 8; z++) {
    for (const x of [107, 108, 109]) {
      const hb = halfBeam(x, z)
      g.set(x, CY - hb, z, C.hullDark)
      g.set(x, CY + hb, z, C.hullDark)
    }
  }

  // Bulwark rail along the open fore/aft decks: posts below, solid cap rail.
  for (let x = 0; x <= bowEndX(HULL_TOP); x++) {
    if (x > D.tier1.x0 - 1 && x < D.tier1.x1 + 1) continue
    const hb = halfBeam(x, HULL_TOP)
    for (const y of [CY - hb, CY + hb]) {
      if (x % 4 === 0) g.set(x, y, HULL_TOP + 1, C.mast)
      g.set(x, y, HULL_TOP + 2, C.mast)
    }
  }
  // Stern transom rail.
  for (let y = CY - halfBeam(0, HULL_TOP); y <= CY + halfBeam(0, HULL_TOP); y++) {
    if (y % 4 === 0) g.set(0, y, HULL_TOP + 1, C.mast)
    g.set(0, y, HULL_TOP + 2, C.mast)
  }
  // Stem post.
  g.box(FERRY_LX - 1, FERRY_LX - 1, CY, CY, HULL_TOP + 1, HULL_TOP + 2, C.mast)

  // Tier 1: main cabin with a mullioned window band.
  g.box(D.tier1.x0, D.tier1.x1, 6, 32, D.tier1.z0, D.tier1.z1, (x, _y, z) => {
    if (z >= 24 && z <= 29) return x % 9 < 3 ? C.cabSide : C.glass
    return C.cabSide
  })
  // Tier 1 roof slab, overhung one old-pixel (3 voxels), highlight to port/bow.
  g.box(12, 88, 3, 35, 33, D.tier1RoofTop, (x, y) =>
    y <= 5 || x >= 84 ? C.cabTopHi : C.cabTop
  )
  // Promenade rail around the tier-1 roof: posts below, solid cap rail.
  g.box(12, 88, 3, 35, 36, 37, (x, y, z) => {
    const edge = y === 3 || y === 35 || x === 12 || x === 88
    if (!edge) return 0
    if (z === 37) return C.mast
    return (x + y) % 4 === 0 ? C.mast : 0
  })

  // Lifeboats on davits, hung outboard of the tier-1 roof. Warm accent —
  // the reference ferry's orange boats, in this scene's palette.
  for (const y of [1, 36]) {
    for (const [bx0, bx1] of [
      [33, 44],
      [54, 65],
    ]) {
      g.box(bx0, bx1, y, y + 1, 34, 37, (x, _y, z) => {
        const end = x === bx0 || x === bx1
        if ((z === 34 || z === 37) && end) return 0 // rounded ends
        if (z === 37) return C.deckHi // canvas cover highlight
        return C.warm
      })
      // Davit arms at the boat ends, hooked up over the gunwale.
      for (const dx of [bx0 - 1, bx1 + 1]) {
        g.box(dx, dx, y, y + 1, 35, 39, C.mast)
      }
    }
  }

  // Tier 2: upper cabin, set back, with its own window band.
  g.box(D.tier2.x0, D.tier2.x1, 9, 29, D.tier2.z0, D.tier2.z1, (x, _y, z) => {
    if (z >= 39 && z <= 44) return (x + 4) % 9 < 3 ? C.cabSide : C.glass
    return C.cabSide
  })
  // Tier 2 roof slab.
  g.box(21, 77, 7, 31, 48, D.tier2RoofTop, (x, y) =>
    y <= 9 || x >= 72 ? C.cabTopHi : C.cabTop
  )

  // Wheelhouse forward on the top tier: wraparound glass, corner posts.
  g.box(D.wheel.x0, D.wheel.x1, 9, 29, D.wheel.z0, D.wheel.z1, (x, y, z) => {
    if (z >= 54 && z <= 58) {
      const corner =
        (x === D.wheel.x0 || x === D.wheel.x1) && (y === 9 || y === 29)
      if (corner) return C.cabSide
      return x % 8 < 1 ? C.cabSide : C.glass
    }
    return C.cabSide
  })
  // Wheelhouse roof + bridge wings spanning the full beam.
  g.box(48, 77, 6, 32, 60, 62, C.cabTopHi)
  g.box(60, 68, 0, 38, 51, 52, C.deckHi)

  // Big raked funnel aft on the tier-2 roof: white body raking aft as it
  // rises, indigo cap, dark exhaust opening on top.
  for (let z = 51; z <= 62; z++) {
    const x0 = 27 - Math.round((z - 51) * 0.45)
    g.box(x0, x0 + 14, 12, 26, z, z, z >= 59 ? C.indigo : C.cabTop)
  }
  g.box(23, 35, 13, 25, 62, 62, C.glass)

  // Foremast with crossbar and masthead light.
  g.box(102, 102, CY, CY, HULL_TOP + 1, 37, C.mast)
  g.box(102, 102, 13, 25, 33, 34, C.mast)
  g.set(102, CY, 38, C.warm)

  // Aft flag pole.
  g.box(3, 3, CY, CY, HULL_TOP + 1, 26, C.mast)
  g.box(3, 3, CY, CY, 27, 28, C.warm)

  // Radar mast on the wheelhouse roof.
  g.box(60, 61, CY, CY, 63, 65, C.mast)
  g.box(57, 64, CY, CY, 66, 66, C.mast)

  return g
}

let cached: VoxelModel | null = null

export function getFerryModel(): VoxelModel {
  if (!cached) cached = buildFerryGrid().extract(FERRY_PALETTE)
  return cached
}
