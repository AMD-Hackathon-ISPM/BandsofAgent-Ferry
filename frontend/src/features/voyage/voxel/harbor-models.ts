// Voxel models for the night loading-harbor: quay slab (with painted roads
// and a marked parking lot), terminal, lamps, trees, boarding vehicles and
// bollards. Each is authored in local model space (x,y,z) and baked to an iso
// sprite by iso-bake.ts so it shares the ferry's heading and shading.
//
// Night palette: cool concrete and asphalt, muted foliage, warm lamp/window
// glow (#f2c14e) and the indigo accent (#4f6bff) carried from the ferry.

import { VoxelGrid, type VoxelModel } from "./voxel-grid"

export type VehicleKind = "car" | "van" | "truck" | "bus"

function hash(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x + 1, 374761393) ^
    Math.imul(y + 1, 668265263) ^
    Math.imul(z + 1, 2246822519) ^
    Math.imul(seed + 1, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

// --- Quay slab -------------------------------------------------------------

const QUAY_PALETTE = [
  "#000000",
  "#3a4a70", // 1 concrete rim top
  "#2f3d61", // 2 side
  "#222d4a", // 3 dark edge
  "#283755", // 4 asphalt apron
  "#46588a", // 5 painted bay line
  "#3d4d78", // 6 apron seam
  "#202b46", // 7 road asphalt
  "#8e9cbd", // 8 road marking
]

/** Painted road network + parking lot, all in quay-local voxel coords. */
export interface QuayRoads {
  /** Local y of the boarding-lane road centerline. */
  laneY: number
  /** Local x range the boarding-lane road spans. */
  laneX0: number
  laneX1: number
  /** Local x of the entry road centerline (runs from the lane to the far edge). */
  entryX: number
  /** Road half-width. */
  halfW: number
  /** Marked parking lot rects with bay-line pitch along x. */
  lots: Array<{ x0: number; x1: number; y0: number; y1: number; pitch: number }>
}

/**
 * Flat concrete quay, `lx`×`ly` footprint, 3 voxels thick, with a painted
 * boarding-lane road, an entry road coming in from the far (off-screen) edge,
 * a dashed centerline on both, a stop line at their T-intersection, and a
 * marked parking lot.
 */
export function quayModel(lx: number, ly: number, roads: QuayRoads): VoxelModel {
  const g = new VoxelGrid(lx, ly, 3)
  const rimX0 = 4
  const rimX1 = lx - 5
  const rimY0 = 4
  const rimY1 = ly - 5
  const { laneY, laneX0, laneX1, entryX, halfW, lots } = roads
  g.box(0, lx - 1, 0, ly - 1, 0, 2, (x, y, z) => {
    if (z === 2) {
      const rim = x < rimX0 || x > rimX1 || y < rimY0 || y > rimY1
      if (rim) return 1
      const onLane = Math.abs(y - laneY) <= halfW && x >= laneX0 && x <= laneX1
      const onEntry = Math.abs(x - entryX) <= halfW && y >= laneY
      if (onLane || onEntry) {
        // Stop line across the entry road just before the intersection.
        if (
          onEntry &&
          y >= laneY + halfW + 1 &&
          y <= laneY + halfW + 2 &&
          Math.abs(x - entryX) <= halfW - 1
        ) {
          return 8
        }
        // Dashed centerlines.
        if (onLane && y === laneY && x % 6 < 3) return 8
        if (onEntry && x === entryX && y > laneY + halfW + 4 && y % 6 < 3) {
          return 8
        }
        return 7
      }
      // Marked parking bays.
      for (const lot of lots) {
        if (x >= lot.x0 && x <= lot.x1 && y >= lot.y0 && y <= lot.y1) {
          if ((x - lot.x0) % lot.pitch === 0) return 5
          return (x + y) % 9 === 0 ? 6 : 4
        }
      }
      // A faint seam across the open apron for asphalt texture.
      if ((x + y) % 9 === 0) return 6
      return 4
    }
    return 2
  })
  return g.extract(QUAY_PALETTE)
}

// --- Terminal building -----------------------------------------------------

const TERMINAL_PALETTE = [
  "#000000",
  "#2a3a63", // 1 wall
  "#33457a", // 2 wall light
  "#1b2747", // 3 wall dark / glass frame
  "#f2c14e", // 4 warm window
  "#f4f7fd", // 5 trim
  "#4f6bff", // 6 roof accent
]

export function terminalModel(): VoxelModel {
  const lx = 46
  const ly = 18
  const lz = 17
  const g = new VoxelGrid(lx, ly, lz)
  // Main block.
  g.box(0, lx - 1, 0, ly - 1, 0, lz - 3, (x, y, z) => {
    // Lit window band around the upper third.
    const band = z >= 7 && z <= 11
    if (band && (x % 4 !== 0) && x > 1 && x < lx - 2) {
      // Some windows dark for variety (baked; flicker handled in 2D).
      return hash(x, y, z, 7) % 5 === 0 ? 3 : 4
    }
    return (x + z) % 7 === 0 ? 2 : 1
  })
  // Flat roof slab with an indigo trim lip.
  g.box(0, lx - 1, 0, ly - 1, lz - 2, lz - 2, 6)
  g.box(1, lx - 2, 1, ly - 2, lz - 1, lz - 1, 3)
  // Ground-floor entrance glow.
  g.box(lx / 2 - 4, lx / 2 + 3, ly - 1, ly - 1, 1, 5, 4)
  return g.extract(TERMINAL_PALETTE)
}

// --- Lamp post -------------------------------------------------------------

const LAMP_PALETTE = [
  "#000000",
  "#8e9cbd", // 1 post
  "#f2c14e", // 2 warm head
  "#fff0c2", // 3 head hi
]

export function lampModel(): VoxelModel {
  const g = new VoxelGrid(3, 3, 15)
  g.box(1, 1, 1, 1, 0, 12, 1)
  // Lamp head.
  g.box(0, 2, 0, 2, 13, 14, (_x, _y, z) => (z === 14 ? 3 : 2))
  return g.extract(LAMP_PALETTE)
}

// --- Tree ------------------------------------------------------------------

const TREE_PALETTE = [
  "#000000",
  "#4a3a2a", // 1 trunk
  "#1d3a35", // 2 foliage dark
  "#2c5247", // 3 foliage
  "#3a6b58", // 4 foliage hi
]

export function treeModel(seed: number): VoxelModel {
  const lx = 9
  const ly = 9
  const lz = 14
  const g = new VoxelGrid(lx, ly, lz)
  g.box(4, 4, 4, 4, 0, 5, 1)
  const lobes = 3
  for (let i = 0; i < lobes; i++) {
    const h0 = hash(i, 0, 0, seed)
    const cx = 3 + ((h0 >>> 3) % 3)
    const cy = 3 + ((h0 >>> 7) % 3)
    const cz = 7 + ((h0 >>> 11) % 4)
    const r = 2.6 + ((h0 >>> 15) % 2)
    g.box(0, lx - 1, 0, ly - 1, 5, lz - 1, (x, y, z) => {
      const dx = x - cx
      const dy = y - cy
      const dz = z - cz
      if (dx * dx + dy * dy + dz * dz > r * r) return 0
      return z > cz ? 4 : hash(x, y, z, seed) % 4 === 0 ? 2 : 3
    })
  }
  return g.extract(TREE_PALETTE)
}

// --- Vehicles --------------------------------------------------------------

const VEHICLE_BODY = [
  "#c84d4d", // red
  "#4f6bff", // indigo
  "#e8edf8", // white
  "#58bfd5", // teal
  "#f2c14e", // amber
  "#6ee7a8", // mint
  "#d08a9e", // rose
  "#8a6bff", // violet
]

/** Vehicle length (voxels along the driving axis) per kind. */
export function vehicleLength(kind: VehicleKind): number {
  if (kind === "car") return 15
  if (kind === "van") return 17
  return 22
}

/**
 * Rotate a grid a quarter turn about z so a model authored driving along +x
 * drives along −y instead (nose toward low y): (x, y) → (y, lx−1−x).
 */
function rotateZToNegY(g: VoxelGrid): VoxelGrid {
  const r = new VoxelGrid(g.ly, g.lx, g.lz)
  for (let z = 0; z < g.lz; z++) {
    for (let y = 0; y < g.ly; y++) {
      for (let x = 0; x < g.lx; x++) {
        const c = g.get(x, y, z)
        if (c) r.set(y, g.lx - 1 - x, z, c)
      }
    }
  }
  return r
}

/**
 * A boarding vehicle, authored along +x as the forward (driving) direction;
 * headlights sit at the high-x nose, tail-lights at the stern. `seed` picks a
 * body colour. `heading` "-y" bakes the same vehicle a quarter turn around z
 * (driving toward low y — up-left on screen — with its nose at the model's
 * y = 0 origin edge). Authored at ~1.6× the old resolution so the bigger
 * harbor zoom shows wheel arches, mirrors, raked glass and a bumper.
 */
export function vehicleModel(
  kind: VehicleKind,
  seed: number,
  heading: "x" | "-y" = "x"
): VoxelModel {
  const body = VEHICLE_BODY[seed % VEHICLE_BODY.length]
  const palette = [
    "#000000",
    body, // 1 body
    "#0e1730", // 2 wheels / shadow
    "#1b2747", // 3 glass
    "#fff0c2", // 4 headlight
    "#ff6a5a", // 5 taillight
    "#aeb9d6", // 6 roof / panel hi
    "#2a3656", // 7 bumper / trim dark
  ]
  const lx = vehicleLength(kind)
  const ly = 7
  let lz: number
  if (kind === "car") lz = 6
  else if (kind === "van") lz = 9
  else if (kind === "bus") lz = 9
  else lz = 10
  const g = new VoxelGrid(lx, ly, lz)
  // Body shell sits above a chassis gap; top layer reads as a panel highlight.
  const floor = 1
  g.box(0, lx - 1, 1, ly - 2, floor, lz - 1, (_x, _y, z) =>
    z === lz - 1 ? 6 : 1
  )
  // Profile shaping per kind, carving the empty space above hood/box.
  if (kind === "car") {
    // Raked hood at the nose, short trunk at the tail, raised cabin between.
    g.box(lx - 4, lx - 1, 1, ly - 2, lz - 2, lz - 1, 0)
    g.set(lx - 4, 1, lz - 2, 1) // soften the hood corner back in
    g.set(lx - 4, ly - 2, lz - 2, 1)
    g.box(0, 2, 1, ly - 2, lz - 1, lz - 1, 0)
  } else if (kind === "van") {
    // Stubby raked nose, tall boxy body.
    g.box(lx - 3, lx - 1, 1, ly - 2, lz - 1, lz - 1, 0)
  } else if (kind === "truck") {
    // Tall cab at the nose, lower long cargo box behind it.
    g.box(0, lx - 7, 1, ly - 2, lz - 2, lz - 1, 0)
    // Cargo box gets a lighter roof and a side seam.
    g.box(0, lx - 8, 1, ly - 2, lz - 3, lz - 3, 6)
  }
  // Glass band on the cabin sides + a raked windscreen / rear screen.
  const winZ0 = kind === "car" ? lz - 2 : lz - 3
  const winZ1 = lz - 1
  const cabX0 = kind === "truck" ? lx - 6 : 2
  const cabX1 = kind === "truck" ? lx - 2 : lx - 4
  g.box(cabX0, cabX1, 1, ly - 2, winZ0, winZ1, (_x, y, z) => {
    if (z >= lz) return 0
    return y === 1 || y === ly - 2 ? 3 : 0
  })
  // Windscreen front face + rear screen (the cabin end caps).
  for (let y = 2; y <= ly - 3; y++) {
    g.set(cabX1, y, winZ0, 3)
    if (kind !== "truck") g.set(cabX0, y, winZ0, 3)
  }
  // Bumpers front and back at the body waist.
  g.box(lx - 1, lx - 1, 1, ly - 2, floor, floor + 1, 7)
  g.box(0, 0, 1, ly - 2, floor, floor + 1, 7)
  // Headlights (nose) + taillights (tail).
  g.set(lx - 1, 2, floor + 1, 4)
  g.set(lx - 1, ly - 3, floor + 1, 4)
  g.set(0, 2, floor + 1, 5)
  g.set(0, ly - 3, floor + 1, 5)
  // Side mirrors poking out just behind the nose.
  const mirX = cabX1 - 1
  g.set(mirX, 0, lz - 3, 1)
  g.set(mirX, ly - 1, lz - 3, 1)
  // Wheels with arches: dark wells front and rear on both sides.
  const axleF = lx - 3
  const axleR = 2
  for (const wx of [axleR, axleF]) {
    for (const wy of [0, ly - 1]) {
      g.set(wx, wy, 0, 2)
      g.set(wx, wy, floor, 2)
    }
    // Arch shadow into the body sides.
    g.set(wx, 1, floor, 7)
    g.set(wx, ly - 2, floor, 7)
  }
  const grid = heading === "-y" ? rotateZToNegY(g) : g
  return grid.extract(palette)
}

// --- Bollard ---------------------------------------------------------------

const BOLLARD_PALETTE = ["#000000", "#9b6a42", "#d0b98c"]

export function bollardModel(): VoxelModel {
  const g = new VoxelGrid(3, 3, 4)
  g.box(0, 2, 0, 2, 0, 3, (_x, _y, z) => (z === 3 ? 2 : 1))
  return g.extract(BOLLARD_PALETTE)
}
