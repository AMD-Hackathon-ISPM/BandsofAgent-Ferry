// The night loading-harbor: a lively isometric quay the ferry is berthed at
// while a run is still pending. Voxel props (quay, terminal, lamps, trees,
// containers, gantry crane, tugboats, boarding vehicles) are baked once to iso
// sprites and placed in a ground coordinate frame anchored to the ship's
// stern, matching dock.ts's screen-anchored approach but in full iso.
//
// Ground frame: gx along the hull (stern→bow), gy across (port→starboard,
// relative to the centerline the stern sits on), gz up from the waterline.
// place() converts a ground point to art-px using the ferry's iso basis, so
// props line up with the baked ferry and slide away with it on departure.

import type { SceneState } from "./scene"
import { BAKED_YAW, ferryGeomAt } from "./voxel/bake"
import { KZ } from "./voxel/voxel-render"
import { bakeIsoSprite, type IsoSprite } from "./voxel/iso-bake"
import {
  bollardModel,
  containerModel,
  craneModel,
  lampModel,
  quayModel,
  terminalModel,
  treeModel,
  tugboatModel,
  vehicleModel,
  type VehicleKind,
} from "./voxel/harbor-models"
import { drawPixelText, pixelTextWidth } from "./cutaway/pixel-font"
import { rect } from "./sprites"

// --- Harbor zoom + berthed-ferry geometry ----------------------------------
//
// The loading harbor is rendered at a larger zoom than the at-sea sprite so the
// berthed ferry, the boarding vehicles and the quay props read as chunky,
// detailed voxels (the reference is a zoomed-in RoRo ferry, not the distant
// dot the sea sprite is). Props are placed in a ground frame anchored to this
// big ferry's stern, which sits at a fixed spot in the buffer — departure is a
// cross-fade to the small sea scene, not a slide.

export const HARBOR_ZOOM = 3
const HARBOR_GEOM = ferryGeomAt(HARBOR_ZOOM)

/** Buffer-fraction placement of the big ferry's mid-ship anchor (upper-right,
 *  leaving the lower-left for the quay + parking lot, as in the reference). */
const FERRY_FX = 0.54
const FERRY_FY = 0.44

/** Top-left blit position of the big harbor ferry sprite in the art buffer. */
export function harborFerryPos(s: SceneState): { x: number; y: number } {
  return {
    x: Math.floor(s.bufW * FERRY_FX - HARBOR_GEOM.anchor.x),
    y: Math.floor(s.bufH * FERRY_FY - HARBOR_GEOM.anchor.y),
  }
}

/** The big ferry's geometry (for render.ts to blit the baked sprite). */
export { HARBOR_GEOM }

// --- Iso ground basis (per ground unit, art px) ----------------------------

const C = Math.cos(BAKED_YAW)
const S = Math.sin(BAKED_YAW)
const Z = HARBOR_ZOOM
const EX = { x: C * Z, y: -0.5 * S * Z }
const EY = { x: S * Z, y: 0.5 * C * Z }
const EZ = { x: 0, y: -KZ * Z }

// --- Layout (ground units relative to the stern waterline) -----------------

const QUAY_LX = 108
const QUAY_LY = 90
/** Quay corner: spread off the stern (−gx) across the camera-facing apron. */
const QUAY_G = { x: -96, y: -12, z: -2 }
const BAY_PITCH = 16

/** Boarding lane: vehicles drive from FAR_X up to the ramp on this centerline. */
const LANE_Y = 7
const FAR_X = -72
const RAMP_X = -16
const DOOR_Z = 7
const LANE_LEN = RAMP_X - FAR_X // 56
const RAMP_LEN = 16
const PATH_LEN = LANE_LEN + RAMP_LEN

/** Static parked cars dressing the apron, in marked rows: [gx, gy, spriteIdx]. */
const PARKED: Array<[number, number, number]> = [
  // Back bank (high gy), nose-in.
  [-76, 58, 0],
  [-60, 58, 3],
  [-44, 58, 1],
  [-28, 58, 6],
  [-76, 70, 4],
  [-60, 70, 2],
  [-44, 70, 7],
  [-28, 70, 5],
  // Front bank (lower gy), a tighter row.
  [-72, 44, 2],
  [-56, 44, 6],
  [-40, 44, 0],
]

const VEHICLE_KINDS: VehicleKind[] = ["car", "van", "truck", "car", "bus", "car", "truck", "van"]

// --- Scene bake ------------------------------------------------------------

export interface HarborScene {
  quay: IsoSprite
  terminal: IsoSprite
  lamp: IsoSprite
  trees: IsoSprite[]
  containers: IsoSprite[]
  crane: IsoSprite
  tug: IsoSprite
  bollard: IsoSprite
  vehicles: IsoSprite[]
}

export function bakeHarborScene(): HarborScene {
  return {
    quay: bakeIsoSprite(quayModel(QUAY_LX, QUAY_LY, BAY_PITCH), Z),
    terminal: bakeIsoSprite(terminalModel(), Z),
    lamp: bakeIsoSprite(lampModel(), Z),
    trees: [0, 1, 2].map((seed) => bakeIsoSprite(treeModel(seed * 7 + 3), Z)),
    containers: [0, 1, 2, 3, 4].map((i) => bakeIsoSprite(containerModel(i), Z)),
    crane: bakeIsoSprite(craneModel(), Z),
    tug: bakeIsoSprite(tugboatModel(), Z),
    bollard: bakeIsoSprite(bollardModel(), Z),
    vehicles: VEHICLE_KINDS.map((k, i) => bakeIsoSprite(vehicleModel(k, i), Z)),
  }
}

// --- Simulation state ------------------------------------------------------

export interface Vehicle {
  /** Index into HarborScene.vehicles (kind + colour). */
  sprite: number
  /** Arc position along the boarding path, ground units. */
  dist: number
  speed: number
}

export interface HarborState {
  vehicles: Vehicle[]
  spawnTimer: number
  craneT: number
}

export function createHarborState(): HarborState {
  const vehicles: Vehicle[] = []
  // Seed a starting queue spread along the lane.
  for (let i = 0; i < 5; i++) {
    vehicles.push({
      sprite: i % VEHICLE_KINDS.length,
      dist: i * 20,
      speed: 0,
    })
  }
  return { vehicles, spawnTimer: 2, craneT: 0 }
}

const VEH_MAX_SPEED = 16
const VEH_GAP = 20

export function updateHarbor(s: SceneState, dt: number) {
  const h = s.harbor
  h.craneT += dt

  // Stop-and-go: each car eases toward the gap ahead of it; the lead car runs
  // free until it reaches the door, then disappears aboard.
  const sealing = s.stage === "depart"
  for (let i = h.vehicles.length - 1; i >= 0; i--) {
    const v = h.vehicles[i]
    const ahead = i > 0 ? h.vehicles[i - 1] : null
    const limit = ahead ? ahead.dist - VEH_GAP : PATH_LEN + 6
    const target = Math.max(0, Math.min(VEH_MAX_SPEED, (limit - v.dist) * 2.5))
    v.speed += (target - v.speed) * Math.min(1, dt * 4)
    v.dist += v.speed * dt
    if (v.dist >= PATH_LEN) h.vehicles.splice(i, 1)
  }

  // Keep the queue replenished while still loading (not once the door seals).
  h.spawnTimer -= dt
  if (!sealing && h.spawnTimer <= 0 && h.vehicles.length < 7) {
    const tail = h.vehicles[h.vehicles.length - 1]
    if (!tail || tail.dist > VEH_GAP) {
      h.vehicles.push({
        sprite: Math.floor(Math.random() * VEHICLE_KINDS.length),
        dist: 0,
        speed: 0,
      })
      h.spawnTimer = 1.6 + Math.random() * 1.8
    } else {
      h.spawnTimer = 0.4
    }
  }
}

/** Ground point → art px, anchored to the big berthed ferry's stern. */
function place(
  s: SceneState,
  gx: number,
  gy: number,
  gz: number
): { x: number; y: number } {
  const pos = harborFerryPos(s)
  const sternX = pos.x + HARBOR_GEOM.stern.x
  const sternY = pos.y + HARBOR_GEOM.stern.y
  return {
    x: sternX + gx * EX.x + gy * EY.x + gz * EZ.x,
    y: sternY + gx * EX.y + gy * EY.y + gz * EZ.y,
  }
}

/** Map a path arc position to a ground point. */
function pathPoint(dist: number): { x: number; y: number; z: number } {
  if (dist <= LANE_LEN) {
    return { x: FAR_X + dist, y: LANE_Y, z: 0 }
  }
  const t = Math.min(1, (dist - LANE_LEN) / RAMP_LEN)
  return { x: RAMP_X + (0 - RAMP_X) * t, y: LANE_Y * (1 - t), z: DOOR_Z * t }
}

function blitSprite(
  ctx: CanvasRenderingContext2D,
  sp: IsoSprite,
  at: { x: number; y: number }
) {
  ctx.drawImage(
    sp.canvas,
    Math.floor(at.x - sp.anchor.x),
    Math.floor(at.y - sp.anchor.y)
  )
}

/** True once the harbor has fully cross-faded out into the sea scene. */
function offScreen(s: SceneState): boolean {
  return s.departFade >= 1
}

// --- Back layer: everything the ship floats in front of --------------------

export function drawHarborBack(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  h: HarborScene,
  a = 1
) {
  if (offScreen(s)) return
  ctx.globalAlpha = a

  // Quay slab.
  blitSprite(ctx, h.quay, place(s, QUAY_G.x, QUAY_G.y, QUAY_G.z))

  // Water reflections under the quay's lit edge.
  drawReflections(ctx, s, a)

  // Terminal building at the far end of the quay, with its departure sign.
  blitSprite(ctx, h.terminal, place(s, -90, 30, 0))
  drawSign(ctx, s, place(s, -84, 26, 21))

  // Tree line along the back edge, lamps a row in front of them.
  for (let i = 0; i < 5; i++) {
    blitSprite(ctx, h.trees[i % h.trees.length], place(s, -84 + i * 20, 78, 0))
  }
  for (let i = 0; i < 6; i++) {
    const gx = -88 + i * 16
    blitSprite(ctx, h.lamp, place(s, gx, 50, 0))
    drawLampGlow(ctx, s, place(s, gx, 50, 15), i, a)
  }

  // Parked cars dressing the apron in marked rows.
  for (const [gx, gy, idx] of PARKED) {
    blitSprite(ctx, h.vehicles[idx % h.vehicles.length], place(s, gx, gy, 0))
  }

  // Container stack at the back-left of the yard, with the gantry crane
  // straddling it (well clear of the ship's berth so it doesn't read as
  // stilts under the hull).
  const stack: Array<[number, number, number, number]> = [
    [-78, 30, 0, 0],
    [-78, 30, 5, 2],
    [-64, 30, 0, 1],
    [-64, 30, 5, 3],
    [-64, 30, 10, 4],
    [-50, 32, 0, 2],
  ]
  for (const [gx, gy, gz, idx] of stack) {
    blitSprite(ctx, h.containers[idx], place(s, gx, gy, gz))
  }
  blitSprite(ctx, h.crane, place(s, -88, 24, 0))

  // Boarding queue: cars on the lane (the ramp portion is drawn in front).
  for (const v of s.harbor.vehicles) {
    if (v.dist > LANE_LEN) continue
    const p = pathPoint(v.dist)
    drawVehicle(ctx, s, h, v, p, a)
  }

  // Tugboats idling in the open water to the right of the ferry.
  const bob = (k: number) => Math.round(Math.sin(s.t * 1.3 + k) * 1.4)
  const t1 = place(s, 34, 96, 0)
  ctx.drawImage(h.tug.canvas, Math.floor(t1.x - h.tug.anchor.x), Math.floor(t1.y - h.tug.anchor.y + bob(0)))
  const t2 = place(s, 72, 58, 0)
  ctx.drawImage(h.tug.canvas, Math.floor(t2.x - h.tug.anchor.x), Math.floor(t2.y - h.tug.anchor.y + bob(2.1)))

  ctx.globalAlpha = 1
}

// --- Front layer: ramp, boarding cars, stern door --------------------------

export function drawHarborFront(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  h: HarborScene,
  a = 1
) {
  if (offScreen(s)) return
  ctx.globalAlpha = a

  // Stern loading door first: the warm-lit cargo hold the cars drive into.
  drawSternDoor(ctx, s)

  // The drawbridge ramp from the quay edge up to the door sill, retracting as
  // the door seals. Drawn as stacked iso rows of rects (no AA on the diagonal).
  const ramp = 1 - clamp01(s.doorT * 1.6)
  if (ramp > 0.04) {
    drawRamp(ctx, s, ramp)
  }

  // Cars climbing the ramp, in front of the hull.
  for (const v of s.harbor.vehicles) {
    if (v.dist <= LANE_LEN) continue
    const p = pathPoint(v.dist)
    drawVehicle(ctx, s, h, v, p, a)
  }

  // Mooring lines + a couple of bollards on the foreground quay lip.
  drawMooringLines(ctx, s)
  blitSprite(ctx, h.bollard, place(s, -8, 20, 0))
  blitSprite(ctx, h.bollard, place(s, -22, 16, 0))

  ctx.globalAlpha = 1
}

/** Two slack mooring lines from bow/stern bollards up to the hull. */
function drawMooringLines(ctx: CanvasRenderingContext2D, s: SceneState) {
  const lines: Array<[number, number, number, number, number, number]> = [
    [-8, 20, 1, 2, 14, 11],
    [-22, 16, 1, 6, 10, 11],
  ]
  for (const [gx0, gy0, gz0, gx1, gy1, gz1] of lines) {
    const a = place(s, gx0, gy0, gz0)
    const mid = place(s, (gx0 + gx1) / 2, (gy0 + gy1) / 2, (gz0 + gz1) / 2 - 1.5)
    const b = place(s, gx1, gy1, gz1)
    ropeArc(ctx, a, mid, b, "#cdb88c")
  }
}

/** A 2px sagging line through three art points (quadratic-ish). */
function ropeArc(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  m: { x: number; y: number },
  b: { x: number; y: number },
  color: string
) {
  ctx.fillStyle = color
  const steps = 18
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const x = u * u * a.x + 2 * u * t * m.x + t * t * b.x
    const y = u * u * a.y + 2 * u * t * m.y + t * t * b.y
    ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1)
  }
}

// --- Pieces ----------------------------------------------------------------

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  h: HarborScene,
  v: Vehicle,
  p: { x: number; y: number; z: number },
  a = 1
) {
  const at = place(s, p.x, p.y, p.z)
  // Warm headlight pool cast ahead (+gx, up-right) while moving.
  if (v.speed > 1.5) {
    const lead = place(s, p.x + 7, p.y, p.z)
    ctx.globalAlpha = 0.5 * a
    rect(ctx, Math.floor(lead.x - 3), Math.floor(lead.y - 1), 6, 3, "#f2c14e")
    ctx.globalAlpha = a
  }
  blitSprite(ctx, h.vehicles[v.sprite % h.vehicles.length], at)
}

/**
 * The drawbridge vehicle ramp: a thick slab from the quay edge up to the door
 * sill, with raised side curbs and a dashed centre lane line. `ramp` is 1 fully
 * lowered .. 0 stowed (the foot lifts toward the sill as the door seals).
 */
function drawRamp(ctx: CanvasRenderingContext2D, s: SceneState, ramp: number) {
  const footX = RAMP_X + (1 - ramp) * (0 - RAMP_X)
  const footZ = (1 - ramp) * DOOR_Z * 0.8
  const halfW = 6
  // Deck planks across the ramp width, lighter down the centre lane. The deck
  // converges from the lane centreline (gy = LANE_Y) down to the door (gy = 0),
  // matching the path the boarding cars drive.
  for (let g = -halfW; g <= halfW; g++) {
    const edge = Math.abs(g) >= halfW - 1
    const lane = Math.abs(g) <= 1
    const a = place(s, footX, LANE_Y + g, footZ)
    const b = place(s, 0, g, DOOR_Z)
    const col = edge ? "#2c3a5e" : lane ? "#4a5c92" : "#3b4c78"
    isoBand(ctx, a, b, col)
  }
  // Raised curbs along both ramp edges.
  for (const g of [-halfW, halfW]) {
    const a = place(s, footX, LANE_Y + g, footZ + 1)
    const b = place(s, 0, g, DOOR_Z + 1)
    isoBand(ctx, a, b, "#8e9cbd")
  }
  // Dashed centre lane marking, following the same converging centreline.
  const segs = 6
  for (let i = 0; i < segs; i++) {
    if (i % 2 === 1) continue
    const t = i / segs
    const gx = footX + (0 - footX) * t
    const gy = LANE_Y * (1 - t)
    const gz = footZ + (DOOR_Z - footZ) * t
    const a = place(s, gx, gy, gz + 0.5)
    rect(ctx, Math.floor(a.x), Math.floor(a.y), 2, 2, "#c6d0e6")
  }
}

/** Fill a 1px-thick run between two art points without diagonal AA. */
function isoBand(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)))
  ctx.fillStyle = color
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    ctx.fillRect(
      Math.floor(a.x + (b.x - a.x) * t),
      Math.floor(a.y + (b.y - a.y) * t),
      2,
      2
    )
  }
}

function drawSternDoor(ctx: CanvasRenderingContext2D, s: SceneState) {
  const doorFrac = 1 - s.doorT
  // Dark opening frame on the stern face (x=0), spanning gy −6..+6, z 1..16.
  for (let z = 1; z <= 16; z++) {
    const a = place(s, 0, -6, z)
    const b = place(s, 0, 6, z)
    isoBand(ctx, a, b, "#0e1730")
  }
  // Warm-lit car deck interior, height shrinking bottom-up as the door seals.
  const top = 1 + Math.round(15 * doorFrac)
  for (let z = 1; z <= top; z++) {
    const a = place(s, 0, -5, z)
    const b = place(s, 0, 5, z)
    isoBand(ctx, a, b, z === top && doorFrac > 0.3 ? "#f4f7fd" : "#f2c14e")
  }
  if (doorFrac > 0.45) {
    // Interior pillars between deck lanes — darker vertical ribs.
    for (const gy of [-3, 0, 3]) {
      const a = place(s, 0, gy, 1)
      const b = place(s, 0, gy, Math.min(top, 13))
      isoBand(ctx, a, b, "#33466f")
    }
    // Two car silhouettes parked inside, hinting the loaded hold.
    for (const [gy, col] of [[-3, "#1b2747"], [2, "#26365b"]] as const) {
      for (let z = 2; z <= 6; z++) {
        const a = place(s, 0, gy - 1.5, z)
        const b = place(s, 0, gy + 1.5, z)
        isoBand(ctx, a, b, col)
      }
    }
  }
}

function drawLampGlow(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  at: { x: number; y: number },
  seed: number,
  a = 1
) {
  const flick = 0.7 + 0.3 * Math.sin(s.t * 6 + seed * 1.7)
  ctx.globalAlpha = 0.32 * flick * a
  ctx.fillStyle = "#f2c14e"
  const x = Math.floor(at.x)
  const y = Math.floor(at.y)
  ctx.fillRect(x - 2, y - 1, 5, 3)
  ctx.fillRect(x - 1, y - 2, 3, 5)
  ctx.globalAlpha = a
}

function drawReflections(ctx: CanvasRenderingContext2D, s: SceneState, a = 1) {
  // Broken warm columns dropping from the quay's lit edge into the water.
  for (let i = 0; i < 30; i++) {
    const gx = -58 + i * 2.1
    const p = place(s, gx, 7, -1)
    const lit = (i + Math.floor(s.t * 4)) % 2 === 0
    if (!lit) continue
    const h = 2 + ((i * 7) % 5)
    ctx.fillStyle = i % 5 === 0 ? "#f2c14e" : "#2c4a7c"
    ctx.globalAlpha = 0.5 * a
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, h)
  }
  ctx.globalAlpha = a
}

function drawSign(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  at: { x: number; y: number }
) {
  const queued = s.voyage.mode === "pending"
  const label = queued ? "NOW BOARDING" : "DEPARTING"
  const x = Math.floor(at.x - pixelTextWidth(label) / 2)
  const y = Math.floor(at.y)
  rect(ctx, x - 3, y - 2, pixelTextWidth(label) + 6, 9, "#0e1730")
  drawPixelText(ctx, label, x, y, "#f2c14e")
  if (Math.floor(s.t * 1.6) % 2 === 0) {
    rect(ctx, x - 6, y, 2, 2, "#ffd166")
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
