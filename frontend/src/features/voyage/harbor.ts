// The night harbors: full-iso quays the ferry berths at. The loading harbor
// occupies the bottom-left corner of the screen (quay bleeding off the bottom
// and left edges, the rest open water); the destination "PR harbor" mirrors
// it in the top-right. Voxel props (quay with painted roads, terminal, lamps,
// trees, parked + boarding vehicles, bollards) are baked once to iso sprites
// and placed in a ground coordinate frame anchored to the screen, not the
// ship — the ferry slides along that frame for the sail-away departure and
// the arrival approach.
//
// Ground frame: gx along the hull (stern→bow, up-right on screen), gy across
// (port→starboard, down-right on screen), gz up from the waterline. (0,0,0)
// is the berth point the ferry's stern sits on when moored.

import type { SceneState } from "./scene"
import { BAKED_YAW, ferryGeomAt } from "./voxel/bake"
import { KZ } from "./voxel/voxel-render"
import { bakeIsoSprite, type IsoSprite } from "./voxel/iso-bake"
import {
  bollardModel,
  lampModel,
  quayModel,
  terminalModel,
  treeModel,
  vehicleLength,
  vehicleModel,
  type QuayRoads,
  type VehicleKind,
} from "./voxel/harbor-models"
import { drawPixelText, pixelTextWidth } from "./cutaway/pixel-font"
import { rect } from "./sprites"

// --- Harbor zoom + berthed-ferry geometry ----------------------------------

export const HARBOR_ZOOM = 3
const HARBOR_GEOM = ferryGeomAt(HARBOR_ZOOM)

/** The big ferry's geometry (for render.ts to blit the baked sprite). */
export { HARBOR_GEOM }

// --- Iso ground basis (per ground unit, art px) ----------------------------

const C = Math.cos(BAKED_YAW)
const S = Math.sin(BAKED_YAW)
const Z = HARBOR_ZOOM
const EX = { x: C * Z, y: -0.5 * S * Z }
const EY = { x: S * Z, y: 0.5 * C * Z }
const EZ = { x: 0, y: -KZ * Z }

// --- Sites ------------------------------------------------------------------
// Each harbor anchors its ground origin (the berth stern point) at a fixed
// buffer fraction; the departure quay fills the bottom-left, the destination
// quay the top-right.

export interface HarborSite {
  fx: number
  fy: number
}

export const DEPART_SITE: HarborSite = { fx: 0.4, fy: 0.62 }
export const DEST_SITE: HarborSite = { fx: 0.62, fy: 0.42 }

function groundOrigin(s: SceneState, site: HarborSite): { x: number; y: number } {
  return { x: Math.floor(s.bufW * site.fx), y: Math.floor(s.bufH * site.fy) }
}

/** Ground point → art px for a harbor site. */
function place(
  s: SceneState,
  site: HarborSite,
  gx: number,
  gy: number,
  gz: number
): { x: number; y: number } {
  const o = groundOrigin(s, site)
  return {
    x: o.x + gx * EX.x + gy * EY.x + gz * EZ.x,
    y: o.y + gx * EX.y + gy * EY.y + gz * EZ.y,
  }
}

/** Top-left blit position of the big ferry sprite at a site, following the
 *  ship's slide along its heading (s.shipG). */
export function harborFerryPos(
  s: SceneState,
  site: HarborSite = DEPART_SITE
): { x: number; y: number } {
  const at = place(s, site, s.shipG, 0, 0)
  return {
    x: Math.floor(at.x - HARBOR_GEOM.stern.x),
    y: Math.floor(at.y - HARBOR_GEOM.stern.y),
  }
}

/** True once the departing ferry has fully cleared the right screen edge. */
export function departShipOffscreen(s: SceneState): boolean {
  if (s.bufW <= 0) return false
  return harborFerryPos(s, DEPART_SITE).x > s.bufW + 8
}

/** Arrival start: ship slide (g-units) putting the whole hull off the
 *  bottom-left edge of the destination scene. */
export function destApproachStartG(s: SceneState): number {
  if (s.bufW <= 0) return -380
  return -((DEST_SITE.fx * s.bufW + 40) / EX.x + 140)
}

// --- Layout (ground units relative to the berth stern point) ---------------

/** Departure quay: bleeds off the bottom and left screen edges. */
const QUAY_G = { x: -150, y: -14, z: -2 }
const QUAY_LX = 164
const QUAY_LY = 204

/** Boarding path: entry road (off-screen bottom) → T-intersection → lane →
 *  ramp → stern door. Distances track the vehicle's NOSE. */
const LANE_Y = 7
const INT_X = -64
const RAMP_X = -16
const DOOR_Z = 7
const ENTRY_Y = 180
const LEG_A = ENTRY_Y - LANE_Y // entry road
const LEG_B = RAMP_X - INT_X // lane to the ramp foot
const RAMP_LEN = 16
const LANE_END = LEG_A + LEG_B
const PATH_LEN = LANE_END + RAMP_LEN

const ROAD_HALF_W = 5

const DEPART_ROADS: QuayRoads = {
  laneY: LANE_Y - QUAY_G.y,
  laneX0: 20,
  laneX1: 160,
  entryX: INT_X - QUAY_G.x,
  halfW: ROAD_HALF_W,
  lots: [
    // Left of the entry road.
    { x0: -114 - QUAY_G.x, x1: -74 - QUAY_G.x, y0: 16 - QUAY_G.y, y1: 46 - QUAY_G.y, pitch: 18 },
    // Between the entry road and the ramp apron.
    { x0: -52 - QUAY_G.x, x1: -24 - QUAY_G.x, y0: 16 - QUAY_G.y, y1: 46 - QUAY_G.y, pitch: 18 },
  ],
}

/** Destination quay: bleeds off the top and right screen edges; the ship
 *  berths along its camera-facing front edge. */
const DEST_QUAY_G = { x: -20, y: -110, z: -2 }
const DEST_QUAY_LX = 170
const DEST_QUAY_LY = 96

const DEST_ROADS: QuayRoads = {
  laneY: -22 - DEST_QUAY_G.y,
  laneX0: 8,
  laneX1: 166,
  entryX: -999, // no entry road at the destination
  halfW: ROAD_HALF_W,
  lots: [],
}

/** Static parked cars dressing the lots: [gx, gy, spriteIdx]. */
const PARKED: Array<[number, number, number]> = [
  [-111, 22, 0],
  [-93, 22, 3],
  [-111, 36, 5],
  [-93, 36, 1],
  [-49, 22, 6],
  [-49, 36, 4],
]

const VEHICLE_KINDS: VehicleKind[] = ["car", "van", "truck", "car", "bus", "car", "truck", "van"]

// --- Scene bake ------------------------------------------------------------

export interface HarborScene {
  quay: IsoSprite
  destQuay: IsoSprite
  terminal: IsoSprite
  lamp: IsoSprite
  trees: IsoSprite[]
  bollard: IsoSprite
  /** Boarding vehicles driving along +gx (and parked cars). */
  vehicles: IsoSprite[]
  /** The same vehicles a quarter turn around z, driving along −gy. */
  vehiclesSide: IsoSprite[]
}

export function bakeHarborScene(): HarborScene {
  return {
    quay: bakeIsoSprite(quayModel(QUAY_LX, QUAY_LY, DEPART_ROADS), Z),
    destQuay: bakeIsoSprite(quayModel(DEST_QUAY_LX, DEST_QUAY_LY, DEST_ROADS), Z),
    terminal: bakeIsoSprite(terminalModel(), Z),
    lamp: bakeIsoSprite(lampModel(), Z),
    trees: [0, 1, 2].map((seed) => bakeIsoSprite(treeModel(seed * 7 + 3), Z)),
    bollard: bakeIsoSprite(bollardModel(), Z),
    vehicles: VEHICLE_KINDS.map((k, i) => bakeIsoSprite(vehicleModel(k, i), Z)),
    vehiclesSide: VEHICLE_KINDS.map((k, i) =>
      bakeIsoSprite(vehicleModel(k, i, "-y"), Z)
    ),
  }
}

// --- Simulation state ------------------------------------------------------

export interface Vehicle {
  /** Index into HarborScene.vehicles (kind + colour). */
  sprite: number
  /** Vehicle length along the driving axis, ground units. */
  len: number
  /** Nose position along the boarding path, ground units. */
  dist: number
  speed: number
}

export interface HarborState {
  vehicles: Vehicle[]
  spawnTimer: number
}

function makeVehicle(sprite: number, dist: number): Vehicle {
  return {
    sprite,
    len: vehicleLength(VEHICLE_KINDS[sprite % VEHICLE_KINDS.length]),
    dist,
    speed: 0,
  }
}

export function createHarborState(): HarborState {
  const vehicles: Vehicle[] = []
  // Seed a starting queue: lead car already on the lane, the rest strung out
  // back down the entry road (those near dist 0 sit off-screen).
  const seeds = [210, 178, 146, 110, 72, 30]
  for (let i = 0; i < seeds.length; i++) {
    vehicles.push(makeVehicle(i % VEHICLE_KINDS.length, seeds[i]))
  }
  return { vehicles, spawnTimer: 2 }
}

const VEH_MAX_SPEED = 16
const VEH_GAP = 8

export function updateHarbor(s: SceneState, dt: number) {
  const h = s.harbor
  const sealing = s.stage === "depart"

  // Stop-and-go: each car eases toward the gap behind the car ahead; the lead
  // car runs free until its tail crosses the door sill. Once the door starts
  // sealing, cars already on the ramp hurry aboard and everyone else holds
  // short of the ramp.
  for (let i = h.vehicles.length - 1; i >= 0; i--) {
    const v = h.vehicles[i]
    const ahead = i > 0 ? h.vehicles[i - 1] : null
    let limit = ahead
      ? ahead.dist - ahead.len - VEH_GAP
      : PATH_LEN + v.len + 2
    if (sealing && v.dist <= LANE_END) limit = Math.min(limit, LANE_END - 6)
    const hurry = sealing && v.dist > LANE_END
    const target = hurry
      ? VEH_MAX_SPEED * 2.2
      : Math.max(0, Math.min(VEH_MAX_SPEED, (limit - v.dist) * 2.5))
    v.speed += (target - v.speed) * Math.min(1, dt * 4)
    v.dist += v.speed * dt
    if (v.dist >= PATH_LEN + v.len) h.vehicles.splice(i, 1)
  }

  // Keep the queue replenished while still loading. New vehicles appear at
  // dist 0 — the entry road's off-screen end — so they never pop into view.
  h.spawnTimer -= dt
  if (!sealing && h.spawnTimer <= 0 && h.vehicles.length < 9) {
    const tail = h.vehicles[h.vehicles.length - 1]
    if (!tail || tail.dist - tail.len > VEH_GAP + 4) {
      h.vehicles.push(makeVehicle(Math.floor(Math.random() * VEHICLE_KINDS.length), 0))
      h.spawnTimer = 1.6 + Math.random() * 1.8
    } else {
      h.spawnTimer = 0.4
    }
  }
}

/** Map a path arc position (vehicle nose) to a ground point + heading. */
function pathPoint(dist: number): {
  x: number
  y: number
  z: number
  heading: "x" | "-y"
} {
  if (dist <= LEG_A) {
    return { x: INT_X, y: ENTRY_Y - dist, z: 0, heading: "-y" }
  }
  if (dist <= LANE_END) {
    return { x: INT_X + (dist - LEG_A), y: LANE_Y, z: 0, heading: "x" }
  }
  const t = Math.min(1, (dist - LANE_END) / RAMP_LEN)
  return {
    x: RAMP_X + (0 - RAMP_X) * t,
    y: LANE_Y * (1 - t),
    z: DOOR_Z * t,
    heading: "x",
  }
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

// --- Departure harbor: back layer (everything the ship floats in front of) --

export function drawHarborBack(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  h: HarborScene,
  a = 1
) {
  if (a <= 0.01) return
  ctx.globalAlpha = a
  const SITE = DEPART_SITE

  // Quay slab with its painted roads and lot.
  blitSprite(ctx, h.quay, place(s, SITE, QUAY_G.x, QUAY_G.y, QUAY_G.z))

  // Water reflections under the quay's lit waterfront edge.
  drawReflections(ctx, s, SITE, -140, -2, -15, a)

  // Terminal building tucked into the bottom-left corner, with its sign.
  blitSprite(ctx, h.terminal, place(s, SITE, -138, 18, 0))
  drawSign(
    ctx,
    s,
    place(s, SITE, -115, 26, 21),
    s.voyage.mode === "pending" ? "NOW BOARDING" : "DEPARTING",
    "#f2c14e"
  )

  // Waterfront dressing: lamps along the berth apron, trees between them and
  // one by the parking lots.
  const lampsAt: Array<[number, number]> = [
    [-135, -8],
    [-112, -8],
    [-90, -8],
    [-46, -8],
  ]
  for (let i = 0; i < lampsAt.length; i++) {
    const [gx, gy] = lampsAt[i]
    blitSprite(ctx, h.lamp, place(s, SITE, gx, gy, 0))
    drawLampGlow(ctx, s, place(s, SITE, gx, gy, 15), i, a)
  }
  blitSprite(ctx, h.trees[0], place(s, SITE, -123, -11, 0))
  blitSprite(ctx, h.trees[1], place(s, SITE, -79, -11, 0))
  blitSprite(ctx, h.trees[2], place(s, SITE, -40, 18, 0))

  // Parked cars in the marked lots.
  for (const [gx, gy, idx] of PARKED) {
    blitSprite(ctx, h.vehicles[idx % h.vehicles.length], place(s, SITE, gx, gy, 0))
  }

  // Boarding queue on the entry road + lane (the ramp leg draws in front).
  for (const v of s.harbor.vehicles) {
    if (v.dist > LANE_END) continue
    drawVehicle(ctx, s, SITE, h, v, a)
  }

  ctx.globalAlpha = 1
}

// --- Departure harbor: front layer (ramp, boarding cars, stern door) --------

export function drawHarborFront(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  h: HarborScene,
  a = 1
) {
  if (a <= 0.01) return
  ctx.globalAlpha = a
  const SITE = DEPART_SITE

  // Stern loading door first: the warm-lit cargo hold the cars drive into.
  // It rides the ship's stern, so it follows the sail-away slide.
  drawSternDoor(ctx, s)

  // The drawbridge ramp from the quay edge up to the door sill, retracting as
  // the door seals. Drawn as stacked iso rows of rects (no AA on the diagonal).
  const ramp = 1 - clamp01(s.doorT * 1.6)
  if (ramp > 0.04) {
    drawRamp(ctx, s, ramp)
  }

  // Cars climbing the ramp, in front of the hull but clipped to the boarding
  // corridor so they vanish *into* the door instead of over the hull.
  let clipped = false
  for (const v of s.harbor.vehicles) {
    if (v.dist <= LANE_END) continue
    if (!clipped) {
      clipped = true
      ctx.save()
      clipBoardingCorridor(ctx, s)
    }
    drawVehicle(ctx, s, SITE, h, v, a)
  }
  if (clipped) ctx.restore()

  // Mooring lines + a couple of bollards on the foreground quay lip. The
  // lines drop once the ship starts pulling out.
  if (s.shipG < 0.5) drawMooringLines(ctx, s, SITE)
  blitSprite(ctx, h.bollard, place(s, SITE, -8, 20, 0))
  blitSprite(ctx, h.bollard, place(s, SITE, -22, 16, 0))

  ctx.globalAlpha = 1
}

/**
 * Clip to the boarding corridor: the stern-door opening swept back down-left
 * along −gx. Any vehicle pixel past the door plane (gx > 0) falls outside and
 * disappears exactly at the dark doorway.
 */
function clipBoardingCorridor(ctx: CanvasRenderingContext2D, s: SceneState) {
  const W = 12
  const L = 44
  const H = 18
  const pts: Array<[number, number, number]> = [
    [0, -W, H],
    [0, W, H],
    [0, W, 0],
    [-L, W, 0],
    [-L, -W, 0],
    [-L, -W, H],
  ]
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p = place(s, DEPART_SITE, pts[i][0], pts[i][1], pts[i][2])
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
  ctx.clip()
}

// --- Destination harbor ------------------------------------------------------

export function drawDestinationBack(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  h: HarborScene,
  a = 1
) {
  if (a <= 0.01) return
  ctx.globalAlpha = a
  const SITE = DEST_SITE

  blitSprite(
    ctx,
    h.destQuay,
    place(s, SITE, DEST_QUAY_G.x, DEST_QUAY_G.y, DEST_QUAY_G.z)
  )
  drawReflections(ctx, s, SITE, -10, 140, -16, a)

  // Terminal + the PR sign that flips green when the pull request is open.
  blitSprite(ctx, h.terminal, place(s, SITE, 38, -52, 0))
  drawSign(
    ctx,
    s,
    place(s, SITE, 61, -44, 21),
    s.voyage.prReady ? "PR READY" : "ARRIVING",
    s.voyage.prReady ? "#52d273" : "#f2c14e"
  )

  const lampsAt: Array<[number, number]> = [
    [6, -20],
    [38, -20],
    [70, -20],
    [102, -20],
  ]
  for (let i = 0; i < lampsAt.length; i++) {
    const [gx, gy] = lampsAt[i]
    blitSprite(ctx, h.lamp, place(s, SITE, gx, gy, 0))
    drawLampGlow(ctx, s, place(s, SITE, gx, gy, 15), i + 2, a)
  }
  blitSprite(ctx, h.trees[0], place(s, SITE, 22, -60, 0))
  blitSprite(ctx, h.trees[2], place(s, SITE, 88, -64, 0))

  ctx.globalAlpha = 1
}

export function drawDestinationFront(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  h: HarborScene,
  a = 1
) {
  if (a <= 0.01) return
  ctx.globalAlpha = a
  const SITE = DEST_SITE

  // Bollards on the quay lip; mooring lines once the ship is alongside.
  blitSprite(ctx, h.bollard, place(s, SITE, -6, -16, 0))
  blitSprite(ctx, h.bollard, place(s, SITE, 28, -16, 0))
  if (s.shipG > -2) {
    const lines: Array<[number, number, number, number, number, number]> = [
      [-6, -16, 1, 2, -12, 11],
      [28, -16, 1, 34, -12, 11],
    ]
    for (const [gx0, gy0, gz0, gx1, gy1, gz1] of lines) {
      const p0 = place(s, SITE, gx0, gy0, gz0)
      const mid = place(s, SITE, (gx0 + gx1) / 2, (gy0 + gy1) / 2, (gz0 + gz1) / 2 - 1.5)
      const p1 = place(s, SITE, gx1, gy1, gz1)
      ropeArc(ctx, p0, mid, p1, "#cdb88c")
    }
  }

  ctx.globalAlpha = 1
}

/** Two slack mooring lines from quay bollards up to the hull. */
function drawMooringLines(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  site: HarborSite
) {
  const lines: Array<[number, number, number, number, number, number]> = [
    [-8, 20, 1, 2, 14, 11],
    [-22, 16, 1, 6, 10, 11],
  ]
  for (const [gx0, gy0, gz0, gx1, gy1, gz1] of lines) {
    const a = place(s, site, gx0, gy0, gz0)
    const mid = place(s, site, (gx0 + gx1) / 2, (gy0 + gy1) / 2, (gz0 + gz1) / 2 - 1.5)
    const b = place(s, site, gx1, gy1, gz1)
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
  site: HarborSite,
  h: HarborScene,
  v: Vehicle,
  a = 1
) {
  const p = pathPoint(v.dist)
  let at: { x: number; y: number }
  let sprite: IsoSprite
  if (p.heading === "-y") {
    // Rotated sprite: nose at the model's y = 0 edge, width 7 along x.
    sprite = h.vehiclesSide[v.sprite % h.vehiclesSide.length]
    at = place(s, site, p.x - 3, p.y, p.z)
  } else {
    // Forward sprite: nose at +x, so anchor the tail one length back.
    sprite = h.vehicles[v.sprite % h.vehicles.length]
    at = place(s, site, p.x - v.len, p.y - 3, p.z)
  }
  // Warm headlight pool cast ahead while moving.
  if (v.speed > 1.5) {
    const lead =
      p.heading === "-y"
        ? place(s, site, p.x, p.y - 6, p.z)
        : place(s, site, p.x + 6, p.y, p.z)
    ctx.globalAlpha = 0.5 * a
    rect(ctx, Math.floor(lead.x - 3), Math.floor(lead.y - 1), 6, 3, "#f2c14e")
    ctx.globalAlpha = a
  }
  blitSprite(ctx, sprite, at)
}

/**
 * The drawbridge vehicle ramp: a thick slab from the quay edge up to the door
 * sill, with raised side curbs and a dashed centre lane line. `ramp` is 1 fully
 * lowered .. 0 stowed (the foot lifts toward the sill as the door seals).
 */
function drawRamp(ctx: CanvasRenderingContext2D, s: SceneState, ramp: number) {
  const SITE = DEPART_SITE
  const footX = RAMP_X + (1 - ramp) * (0 - RAMP_X)
  const footZ = (1 - ramp) * DOOR_Z * 0.8
  const halfW = 6
  // Deck planks across the ramp width, lighter down the centre lane. The deck
  // converges from the lane centreline (gy = LANE_Y) down to the door (gy = 0),
  // matching the path the boarding cars drive.
  for (let g = -halfW; g <= halfW; g++) {
    const edge = Math.abs(g) >= halfW - 1
    const lane = Math.abs(g) <= 1
    const a = place(s, SITE, footX, LANE_Y + g, footZ)
    const b = place(s, SITE, 0, g, DOOR_Z)
    const col = edge ? "#2c3a5e" : lane ? "#4a5c92" : "#3b4c78"
    isoBand(ctx, a, b, col)
  }
  // Raised curbs along both ramp edges.
  for (const g of [-halfW, halfW]) {
    const a = place(s, SITE, footX, LANE_Y + g, footZ + 1)
    const b = place(s, SITE, 0, g, DOOR_Z + 1)
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
    const a = place(s, SITE, gx, gy, gz + 0.5)
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
  const SITE = DEPART_SITE
  const g = s.shipG // the door rides the stern through the sail-away
  const doorFrac = 1 - s.doorT
  // Dark opening frame on the stern face (x=g), spanning gy −6..+6, z 1..16.
  for (let z = 1; z <= 16; z++) {
    const a = place(s, SITE, g, -6, z)
    const b = place(s, SITE, g, 6, z)
    isoBand(ctx, a, b, "#0e1730")
  }
  // Warm-lit car deck interior, height shrinking bottom-up as the door seals.
  const top = 1 + Math.round(15 * doorFrac)
  for (let z = 1; z <= top; z++) {
    const a = place(s, SITE, g, -5, z)
    const b = place(s, SITE, g, 5, z)
    isoBand(ctx, a, b, z === top && doorFrac > 0.3 ? "#f4f7fd" : "#f2c14e")
  }
  if (doorFrac > 0.45) {
    // Interior pillars between deck lanes — darker vertical ribs.
    for (const gy of [-3, 0, 3]) {
      const a = place(s, SITE, g, gy, 1)
      const b = place(s, SITE, g, gy, Math.min(top, 13))
      isoBand(ctx, a, b, "#33466f")
    }
    // Two car silhouettes parked inside, hinting the loaded hold.
    for (const [gy, col] of [[-3, "#1b2747"], [2, "#26365b"]] as const) {
      for (let z = 2; z <= 6; z++) {
        const a = place(s, SITE, g, gy - 1.5, z)
        const b = place(s, SITE, g, gy + 1.5, z)
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

/** Broken warm columns dropping from a quay's lit edge into the water. */
function drawReflections(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  site: HarborSite,
  gx0: number,
  gx1: number,
  gy: number,
  a = 1
) {
  const n = 30
  for (let i = 0; i < n; i++) {
    const gx = gx0 + ((gx1 - gx0) * i) / n
    const p = place(s, site, gx, gy, -1)
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
  at: { x: number; y: number },
  label: string,
  color: string
) {
  const x = Math.floor(at.x - pixelTextWidth(label) / 2)
  const y = Math.floor(at.y)
  rect(ctx, x - 3, y - 2, pixelTextWidth(label) + 6, 9, "#0e1730")
  drawPixelText(ctx, label, x, y, color)
  if (Math.floor(s.t * 1.6) % 2 === 0) {
    rect(ctx, x - 6, y, 2, 2, color === "#52d273" ? "#52d273" : "#ffd166")
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
