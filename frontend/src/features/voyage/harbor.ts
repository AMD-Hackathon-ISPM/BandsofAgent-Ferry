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
  containerModel,
  forkliftModel,
  gateModel,
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

export const DEPART_SITE: HarborSite = { fx: 0.3, fy: 0.64 }
export const DEST_SITE: HarborSite = { fx: 0.42, fy: 0.58 }

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

/** Departure quay: bleeds off the bottom and left screen edges. Its berth
 *  edge stops short of the stern (gx −4) so the hull floats off the dock and
 *  the ramp bridges the water gap. */
const QUAY_G = { x: -150, y: -14, z: -2 }
const QUAY_LX = 146
const QUAY_LY = 204

/** Boarding path: entry road (off-screen bottom) → T-intersection → lane →
 *  ramp → stern door. Distances track the vehicle's NOSE. */
const LANE_Y = 7
const INT_X = -64
const RAMP_X = -16
/** Door sill / top heights, matching the door painted on the baked transom. */
const DOOR_Z = 3
const DOOR_TOP = 14
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
  laneX1: RAMP_X - QUAY_G.x,
  entryX: INT_X - QUAY_G.x,
  halfW: ROAD_HALF_W,
  lots: [
    // Main lot between the entry road and the ramp apron.
    { x0: -52 - QUAY_G.x, x1: -12 - QUAY_G.x, y0: 16 - QUAY_G.y, y1: 46 - QUAY_G.y, pitch: 18 },
    // Overflow lot left of the entry road, bleeding off the bottom edge.
    { x0: -114 - QUAY_G.x, x1: -74 - QUAY_G.x, y0: 32 - QUAY_G.y, y1: 62 - QUAY_G.y, pitch: 18 },
  ],
}

/** Destination quay: one big concrete slab like the departure harbor,
 *  bleeding off the top and left screen edges. The ship berths alongside its
 *  front edge (port side to the land, bow past the pier end). */
const DEST_QUAY_G = { x: -150, y: -144, z: -2 }
const DEST_QUAY_LX = 220
const DEST_QUAY_LY = 110

/** Side cargo bridge: from the ship's camera-hidden port-side door across
 *  the berth gap down onto the quay. Trucks roll off along −gy. */
const BRIDGE_X = 14
const BRIDGE_SHIP_Y = -16
 const BRIDGE_PAD_Y = -35
const BRIDGE_HALF_W = 6
const UNLOAD_BRIDGE_LEN = BRIDGE_SHIP_Y - BRIDGE_PAD_Y
/** The exit gatehouse the unload road runs through; trucks are clipped away
 *  at this plane, so they read as leaving the harbor through the gate. */
const GATE_Y = -100
const UNLOAD_END = BRIDGE_SHIP_Y - GATE_Y // nose distance at the gate plane

const DEST_ROADS: QuayRoads = {
  // Cross lane the unload road tees into, just past the gate.
  laneY: -114 - DEST_QUAY_G.y,
  laneX0: 20,
  laneX1: DEST_QUAY_LX - 20,
  entryX: BRIDGE_X - DEST_QUAY_G.x, // the unload road off the bridge foot
  halfW: ROAD_HALF_W,
  lots: [
    // Container yard right of the road, between the gate and the berth.
    { x0: 180, x1: 212, y0: 46, y1: 74, pitch: 16 },
    // Second yard on the terminal side.
    { x0: 60, x1: 100, y0: 50, y1: 78, pitch: 18 },
  ],
}

/** Static parked cars dressing the lots: [gx, gy, spriteIdx]. */
const PARKED: Array<[number, number, number]> = [
  // Main lot.
  [-49, 22, 0],
  [-31, 22, 3],
  [-49, 36, 5],
  [-31, 36, 1],
  // Overflow lot (partially bleeding off the bottom edge).
  [-93, 38, 6],
  [-111, 38, 4],
]

const VEHICLE_KINDS: VehicleKind[] = ["car", "van", "truck", "car", "bus", "car", "truck", "van"]

// --- Scene bake ------------------------------------------------------------

export interface HarborScene {
  quay: IsoSprite
  destQuay: IsoSprite
  gate: IsoSprite
  terminal: IsoSprite
  lamp: IsoSprite
  trees: IsoSprite[]
  containers: IsoSprite[]
  forklift: IsoSprite
  bollard: IsoSprite
  /** Boarding vehicles driving along +gx (and parked cars). */
  vehicles: IsoSprite[]
  /** The same vehicles a quarter turn around z, driving along −gy. */
  vehiclesSide: IsoSprite[]
}

const CONTAINER_COLORS: Array<[string, string]> = [
  ["#d9772f", "#a8581f"], // orange
  ["#3f6ad8", "#2c4ba0"], // indigo
  ["#c84d4d", "#94372f"], // red
]

export function bakeHarborScene(): HarborScene {
  return {
    quay: bakeIsoSprite(quayModel(QUAY_LX, QUAY_LY, DEPART_ROADS), Z),
    destQuay: bakeIsoSprite(
      quayModel(DEST_QUAY_LX, DEST_QUAY_LY, DEST_ROADS),
      Z
    ),
    gate: bakeIsoSprite(gateModel(), Z),
    terminal: bakeIsoSprite(terminalModel(), Z),
    lamp: bakeIsoSprite(lampModel(), Z),
    trees: [0, 1, 2].map((seed) => bakeIsoSprite(treeModel(seed * 7 + 3), Z)),
    containers: CONTAINER_COLORS.map(([body, shade]) =>
      bakeIsoSprite(containerModel(body, shade), Z)
    ),
    forklift: bakeIsoSprite(forkliftModel(), Z),
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
  /** Ramp stow progress, 0 lowered .. 1 vertical against the transom. Holds
   *  at 0 until every boarding vehicle has cleared the ramp and hold. */
  rampStow: number
  /** Door plate seal progress, 0 open .. 1 sealed; runs after the ramp. */
  doorSeal: number
  /** Cargo rolling off at the destination berth (nose dist along −gy). */
  unload: Vehicle[]
  unloadTimer: number
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
  return {
    vehicles,
    spawnTimer: 2,
    rampStow: 0,
    doorSeal: 0,
    unload: [],
    unloadTimer: 2,
  }
}

const VEH_MAX_SPEED = 16
const VEH_GAP = 8
const RAMP_STOW_DUR = 0.9
const DOOR_SEAL_DUR = 1.0

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
      : PATH_LEN + v.len + 6
    if (sealing && v.dist <= LANE_END) limit = Math.min(limit, LANE_END - 6)
    const hurry = sealing && v.dist > LANE_END
    const target = hurry
      ? VEH_MAX_SPEED * 2.2
      : Math.max(0, Math.min(VEH_MAX_SPEED, (limit - v.dist) * 2.5))
    v.speed += (target - v.speed) * Math.min(1, dt * 4)
    v.dist += v.speed * dt
    // Despawn only once the tail is fully through the door plane (plus a
    // safety margin) — until then the clip mask swallows it pixel by pixel.
    if (v.dist >= PATH_LEN + v.len + 2) h.vehicles.splice(i, 1)
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

  // Cast-off choreography: once the last boarding vehicle is aboard, the ramp
  // swings up against the transom, then the hull door plate seals over it.
  const boarding = h.vehicles.some((v) => v.dist > LANE_END)
  if (sealing && !boarding) {
    h.rampStow = Math.min(1, h.rampStow + dt / RAMP_STOW_DUR)
  } else if (!sealing) {
    h.rampStow = Math.max(0, h.rampStow - dt / RAMP_STOW_DUR)
  }
  if (sealing && h.rampStow >= 1) {
    h.doorSeal = Math.min(1, h.doorSeal + dt / DOOR_SEAL_DUR)
  } else if (!sealing) {
    h.doorSeal = Math.max(0, h.doorSeal - dt / DOOR_SEAL_DUR)
  }
}

/**
 * Destination unloading: once moored, cargo trucks roll out of the ship's
 * camera-hidden port-side door, across the side bridge and away up the pad's
 * unload road — emerging from behind the hull, which sells the door without
 * painting one. Stateless beyond the queue; cleared while not docked so the
 * flow restarts on every arrival.
 */
const UNLOAD_KINDS = [2, 6, 1, 7] // trucks + vans haul the migration cargo

export function updateDestination(s: SceneState, dt: number) {
  const h = s.harbor
  if (s.stage !== "docked") {
    h.unload.length = 0
    h.unloadTimer = 2
    return
  }

  for (let i = h.unload.length - 1; i >= 0; i--) {
    const v = h.unload[i]
    const ahead = i > 0 ? h.unload[i - 1] : null
    const limit = ahead
      ? ahead.dist - ahead.len - VEH_GAP
      : UNLOAD_END + v.len + 6
    const target = Math.max(
      0,
      Math.min(VEH_MAX_SPEED * 0.8, (limit - v.dist) * 2.5)
    )
    v.speed += (target - v.speed) * Math.min(1, dt * 4)
    v.dist += v.speed * dt
    // Despawn only once the tail is fully past the gate plane — until then
    // the clip corridor swallows the sprite pixel by pixel.
    if (v.dist >= UNLOAD_END + v.len + 2) h.unload.splice(i, 1)
  }

  h.unloadTimer -= dt
  if (h.unloadTimer <= 0 && h.unload.length < 4) {
    const tail = h.unload[h.unload.length - 1]
    if (!tail || tail.dist - tail.len > VEH_GAP + 6) {
      h.unload.push(
        makeVehicle(
          UNLOAD_KINDS[Math.floor(Math.random() * UNLOAD_KINDS.length)],
          0
        )
      )
      h.unloadTimer = 2.5 + Math.random() * 2.5
    } else {
      h.unloadTimer = 0.5
    }
  }
}

/** Unload path: down the bridge from the door sill, then inland along −gy. */
function destPathPoint(dist: number): {
  x: number
  y: number
  z: number
  heading: "x" | "-y"
} {
  const t = Math.min(1, dist / UNLOAD_BRIDGE_LEN)
  return {
    x: BRIDGE_X,
    y: BRIDGE_SHIP_Y - dist,
    z: DOOR_Z * (1 - t),
    heading: "-y",
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
  if (dist <= PATH_LEN) {
    const t = (dist - LANE_END) / RAMP_LEN
    return {
      x: RAMP_X + (0 - RAMP_X) * t,
      y: LANE_Y * (1 - t),
      z: DOOR_Z * t,
      heading: "x",
    }
  }
  // Past the door plane: drive on into the hold so the clip mask can swallow
  // the sprite nose-first instead of it vanishing whole at the doorway.
  return { x: dist - PATH_LEN, y: 0, z: DOOR_Z, heading: "x" }
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
  drawReflections(ctx, s, SITE, -100, -6, -15, a)

  // Terminal building tucked into the bottom-left corner (half bleeding off
  // the left edge), with its sign.
  blitSprite(ctx, h.terminal, place(s, SITE, -118, 8, 0))
  drawSign(
    ctx,
    s,
    place(s, SITE, -95, 16, 21),
    s.voyage.mode === "pending" ? "NOW BOARDING" : "DEPARTING",
    "#f2c14e"
  )

  // Waterfront dressing: lamps along the berth apron, trees between them and
  // one on the green strip at the intersection corner.
  const lampsAt: Array<[number, number]> = [
    [-88, -8],
    [-56, -8],
    [-24, -8],
    [-74, 18],
  ]
  for (let i = 0; i < lampsAt.length; i++) {
    const [gx, gy] = lampsAt[i]
    blitSprite(ctx, h.lamp, place(s, SITE, gx, gy, 0))
    drawLampGlow(ctx, s, place(s, SITE, gx, gy, 15), i, a)
  }
  blitSprite(ctx, h.trees[0], place(s, SITE, -104, -11, 0))
  blitSprite(ctx, h.trees[1], place(s, SITE, -40, -11, 0))
  blitSprite(ctx, h.trees[2], place(s, SITE, -58, 20, 0))

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

  // Stern door, in two staged phases (timed by updateHarbor so they wait for
  // boarding vehicles): first the ramp swings up against the transom
  // (becoming the door), then the hull plate seals over it bottom-up. Once
  // fully sealed nothing extra is drawn — the baked ship sprite already
  // carries the painted closed door.
  const hs = s.harbor
  if (hs.doorSeal < 1) {
    drawSternDoor(ctx, s)
    drawRamp(ctx, s, hs.rampStow)
    if (hs.doorSeal > 0) drawDoorSeal(ctx, s, hs.doorSeal)
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
  blitSprite(ctx, h.bollard, place(s, SITE, -10, 20, 0))
  blitSprite(ctx, h.bollard, place(s, SITE, -7, 30, 0))

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

  // One big concrete quay, like the departure harbor: painted unload road
  // from the bridge foot up through the gate, a cross lane, marked yards.
  blitSprite(
    ctx,
    h.destQuay,
    place(s, SITE, DEST_QUAY_G.x, DEST_QUAY_G.y, DEST_QUAY_G.z)
  )
  drawReflections(ctx, s, SITE, -56, 66, -37, a)

  // Arrivals terminal on the upper quay; the live status sign stands on a
  // billboard near the berth, flipping green when the PR opens.
  blitSprite(ctx, h.terminal, place(s, SITE, -96, -112, 0))
  drawSign(ctx, s, place(s, SITE, -73, -104, 21), "ARRIVALS", "#c6d0e6")
  drawSign(
    ctx,
    s,
    place(s, SITE, -44, -48, 12),
    s.voyage.prReady ? "PR READY" : "UNLOADING",
    s.voyage.prReady ? "#52d273" : "#f2c14e"
  )

  // Greenery strips between the yards and the waterfront.
  blitSprite(ctx, h.trees[0], place(s, SITE, -46, -118, 0))
  blitSprite(ctx, h.trees[1], place(s, SITE, -120, -96, 0))
  blitSprite(ctx, h.trees[2], place(s, SITE, -64, -52, 0))

  // Container yards either side of the unload road, with a forklift working
  // the stacks.
  blitSprite(ctx, h.containers[0], place(s, SITE, 34, -88, 0))
  blitSprite(ctx, h.containers[1], place(s, SITE, 52, -88, 0))
  blitSprite(ctx, h.containers[2], place(s, SITE, 34, -88, 7))
  blitSprite(ctx, h.containers[2], place(s, SITE, 44, -70, 0))
  blitSprite(ctx, h.containers[1], place(s, SITE, -78, -84, 0))
  blitSprite(ctx, h.containers[0], place(s, SITE, -60, -84, 0))
  blitSprite(ctx, h.containers[0], place(s, SITE, -78, -84, 7))
  // Forklift working the right-hand stacks, off the unload road (road spans
  // gx 9..19) so the cargo trucks don't drive through it.
  blitSprite(ctx, h.forklift, place(s, SITE, 24, -80, 0))

  // Lamps along the berth apron and one at the gate.
  const lampsAt: Array<[number, number]> = [
    [-52, -40],
    [-16, -40],
    [44, -40],
    [34, -96],
  ]
  for (let i = 0; i < lampsAt.length; i++) {
    const [gx, gy] = lampsAt[i]
    blitSprite(ctx, h.lamp, place(s, SITE, gx, gy, 0))
    drawLampGlow(ctx, s, place(s, SITE, gx, gy, 15), i + 2, a)
  }

  // Mooring: bollards on the pad lip, lines up to the hull once alongside.
  // Back layer on purpose — the ropes vanish at the hull silhouette.
  blitSprite(ctx, h.bollard, place(s, SITE, -8, -38, 0))
  blitSprite(ctx, h.bollard, place(s, SITE, 36, -38, 0))
  if (s.shipG > -2) {
    const lines: Array<[number, number, number, number, number, number]> = [
      [-8, -38, 1, 0, -14, 11],
      [36, -38, 1, 44, -14, 11],
    ]
    for (const [gx0, gy0, gz0, gx1, gy1, gz1] of lines) {
      const p0 = place(s, SITE, gx0, gy0, gz0)
      const mid = place(
        s,
        SITE,
        (gx0 + gx1) / 2,
        (gy0 + gy1) / 2,
        (gz0 + gz1) / 2 - 1.5
      )
      const p1 = place(s, SITE, gx1, gy1, gz1)
      ropeArc(ctx, p0, mid, p1, "#cdb88c")
    }
  }

  // Side cargo bridge + the trucks rolling off across it. Drawn behind the
  // ship sprite, so each truck emerges from behind the hull — reading as
  // driving out of the ship's far-side door. The clip corridor ends at the
  // gate plane, so trucks vanish pixel by pixel into the gatehouse.
  drawSideBridge(ctx, s)
  if (s.harbor.unload.length > 0) {
    ctx.save()
    clipUnloadCorridor(ctx, s)
    for (const v of s.harbor.unload) {
      drawVehicleAt(ctx, s, SITE, h, v, destPathPoint(v.dist), a)
    }
    ctx.restore()
  }

  // The exit gatehouse straddling the road (drawn over the vanishing point).
  blitSprite(ctx, h.gate, place(s, SITE, BRIDGE_X - 9, GATE_Y - 2, 0))

  ctx.globalAlpha = 1
}

/**
 * Clip to the unload corridor: the road swept from just behind the ship's
 * side door up to the gate plane (gy = GATE_Y). Truck pixels past the gate
 * fall outside and disappear exactly under the gatehouse beam.
 */
function clipUnloadCorridor(ctx: CanvasRenderingContext2D, s: SceneState) {
  const W = 8
  const H = 16
  const FY = BRIDGE_SHIP_Y + 8
  const pts: Array<[number, number, number]> = [
    [BRIDGE_X - W, GATE_Y, H],
    [BRIDGE_X + W, GATE_Y, H],
    [BRIDGE_X + W, GATE_Y, 0],
    [BRIDGE_X + W, FY, 0],
    [BRIDGE_X - W, FY, 0],
    [BRIDGE_X - W, FY, H],
  ]
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p = place(s, DEST_SITE, pts[i][0], pts[i][1], pts[i][2])
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
  ctx.clip()
}

/** The flat cargo bridge from the pad's berth edge up to the hidden side
 *  door: deck strips with a lighter drive lane and raised curb rails. */
function drawSideBridge(ctx: CanvasRenderingContext2D, s: SceneState) {
  const SITE = DEST_SITE
  for (let g = -BRIDGE_HALF_W; g <= BRIDGE_HALF_W; g++) {
    const edge = Math.abs(g) >= BRIDGE_HALF_W - 1
    const lane = Math.abs(g) <= 1
    const a = place(s, SITE, BRIDGE_X + g, BRIDGE_PAD_Y, 0)
    const b = place(s, SITE, BRIDGE_X + g, BRIDGE_SHIP_Y, DOOR_Z)
    isoBand(ctx, a, b, edge ? "#2c3a5e" : lane ? "#4a5c92" : "#3b4c78")
  }
  for (const g of [-BRIDGE_HALF_W, BRIDGE_HALF_W]) {
    const a = place(s, SITE, BRIDGE_X + g, BRIDGE_PAD_Y, 1)
    const b = place(s, SITE, BRIDGE_X + g, BRIDGE_SHIP_Y, DOOR_Z + 1)
    isoBand(ctx, a, b, "#8e9cbd")
  }
}


/** Two slack mooring lines from quay bollards up to the hull. */
function drawMooringLines(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  site: HarborSite
) {
  const lines: Array<[number, number, number, number, number, number]> = [
    [-10, 20, 1, 2, 14, 11],
    [-7, 30, 1, 10, 16, 11],
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
  drawVehicleAt(ctx, s, site, h, v, pathPoint(v.dist), a)
}

function drawVehicleAt(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  site: HarborSite,
  h: HarborScene,
  v: Vehicle,
  p: ReturnType<typeof pathPoint>,
  a = 1
) {
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
 * The vehicle ramp: a flat bridge slab from the quay edge across the berth
 * gap to the door sill, with raised side curbs and a dashed centre lane line.
 * `rampT` is 0 fully lowered .. 1 stowed — the ramp rotates up around the
 * door sill hinge until it stands vertical against the transom, covering the
 * opening like a real stern ramp-door.
 */
function drawRamp(ctx: CanvasRenderingContext2D, s: SceneState, rampT: number) {
  const SITE = DEPART_SITE
  // Hinge at the door sill (gx 0, gz DOOR_Z); the foot starts on the quay
  // (slight droop below the sill) and swings up to the door top. The slab
  // shortens as it rises so the vertical plate covers the opening exactly.
  const droop = Math.atan2(DOOR_Z, RAMP_LEN)
  const ang = -droop + rampT * (Math.PI / 2 + droop)
  const len = RAMP_LEN + (DOOR_TOP - DOOR_Z - RAMP_LEN) * rampT
  const footX = -len * Math.cos(ang)
  const footZ = DOOR_Z + len * Math.sin(ang)
  const footY = LANE_Y * (1 - rampT)
  const halfW = 6
  // Deck planks across the ramp width, lighter down the centre lane. The deck
  // converges from the lane centreline (gy = LANE_Y) down to the door (gy = 0),
  // matching the path the boarding cars drive.
  for (let g = -halfW; g <= halfW; g++) {
    const edge = Math.abs(g) >= halfW - 1
    const lane = Math.abs(g) <= 1
    const a = place(s, SITE, footX, footY + g, footZ)
    const b = place(s, SITE, 0, g, DOOR_Z)
    const col = edge ? "#2c3a5e" : lane ? "#4a5c92" : "#3b4c78"
    isoBand(ctx, a, b, col)
  }
  // Raised curbs along both ramp edges (folded flat once stowing begins).
  if (rampT < 0.2) {
    for (const g of [-halfW, halfW]) {
      const a = place(s, SITE, footX, footY + g, footZ + 1)
      const b = place(s, SITE, 0, g, DOOR_Z + 1)
      isoBand(ctx, a, b, "#8e9cbd")
    }
  }
  // Dashed centre lane marking, following the same converging centreline.
  const segs = 6
  for (let i = 0; i < segs; i++) {
    if (i % 2 === 1) continue
    const t = i / segs
    const gx = footX + (0 - footX) * t
    const gy = footY * (1 - t)
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

/**
 * The open stern doorway: a dark hold cut into the transom, matching the
 * footprint of the closed door painted on the baked ship (gy −6..6,
 * z DOOR_Z..DOOR_TOP). Deliberately unlit — boarding cars read as driving
 * into shadow, and the clip corridor erases them at this plane.
 */
function drawSternDoor(ctx: CanvasRenderingContext2D, s: SceneState) {
  const SITE = DEPART_SITE
  const g = s.shipG // the door rides the stern through the sail-away
  // Dark opening frame on the stern face (x=g).
  for (let z = DOOR_Z; z <= DOOR_TOP; z++) {
    const a = place(s, SITE, g, -6, z)
    const b = place(s, SITE, g, 6, z)
    isoBand(ctx, a, b, "#0e1730")
  }
  // Faint cold sheen on the hold deck so the opening reads as depth.
  for (let z = DOOR_Z; z <= DOOR_Z + 1; z++) {
    const a = place(s, SITE, g, -5, z)
    const b = place(s, SITE, g, 5, z)
    isoBand(ctx, a, b, "#22335c")
  }
  // Interior pillars between deck lanes — barely-there vertical ribs.
  for (const gy of [-3, 0, 3]) {
    const a = place(s, SITE, g, gy, DOOR_Z + 2)
    const b = place(s, SITE, g, gy, DOOR_TOP - 2)
    isoBand(ctx, a, b, "#16213f")
  }
}

/**
 * The hull door plate sealing the opening bottom-up behind the stowed ramp,
 * painted in the same plating colour as the closed door on the baked ship so
 * the hand-off at doorT = 1 is seamless.
 */
function drawDoorSeal(ctx: CanvasRenderingContext2D, s: SceneState, sealT: number) {
  const SITE = DEPART_SITE
  const g = s.shipG
  const top = DOOR_Z + Math.round((DOOR_TOP - DOOR_Z) * sealT)
  for (let z = DOOR_Z; z <= top; z++) {
    const a = place(s, SITE, g, -6, z)
    const b = place(s, SITE, g, 6, z)
    isoBand(ctx, a, b, z === top && sealT < 1 ? "#aab6d0" : "#7e8cab")
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
