// Voyage scene state + simulation step. All of this lives in refs and is
// mutated by the render loop — React never re-renders per frame.

import { SEA_VX, SEA_VY } from "./sea"
import { FERRY_ANCHOR, FERRY_STERN } from "./sprites"
import type { VoyageStatus } from "./progress"
import type { InspectState } from "./inspect"
import {
  createHarborState,
  departShipOffscreen,
  destApproachStartG,
  updateDestination,
  updateHarbor,
  type HarborState,
} from "./harbor"

/** "inspect" is the prop-inspection mode entered by clicking the ship. */
export type SceneMode = "sea" | "inspect"

/**
 * Where the voyage physically is: berthed at the loading dock, pulling out,
 * on open water, approaching the destination harbor, or moored at it. Driven
 * by the run status (voyage.mode) — the stage adds the spatial transitions.
 */
export type VoyageStage = "dock" | "depart" | "sea" | "arrive" | "docked"

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
}

export interface SceneState {
  mode: SceneMode
  stage: VoyageStage
  /** Seconds in the current stage. */
  stageT: number
  /** Harbor→sea cross-fade, 0 = harbor fully shown .. 1 = faded out to sea. */
  departFade: number
  /** Sea→destination-harbor cross-fade, 0 = open sea .. 1 = harbor shown. */
  arriveFade: number
  /**
   * Big berthed ferry's slide along its heading, in ground units (+gx =
   * up-right). 0 = berthed; departure drives it positive, the destination
   * approach starts deep negative and eases to 0.
   */
  shipG: number
  /** Departure speed integrator for the sail-away, ground units/s. */
  shipV: number
  /**
   * At-sea entry, 0 = ship still off the bottom-left edge .. 1 = locked at
   * the screen center. Driven only by the depart→sea handoff; snaps to 1.
   */
  seaEnter: number
  /** Eased ship x as a fraction of the buffer width. */
  shipXFrac: number
  /** Stern loading door, 0 open .. 1 sealed. */
  doorT: number
  t: number
  bufW: number
  bufH: number
  scrollX: number
  scrollY: number
  /** Eased voyage completion shown on screen. */
  progress: number
  /** Eased sea-speed factor (1 = full steam). */
  speed: number
  voyage: VoyageStatus
  wake: Particle[]
  wakeTimer: number
  /** Ship blit rect in art px, refreshed by render; used for click hit-tests. */
  shipRect: { x: number; y: number; w: number; h: number }
  /** Live prop-inspection state while mode === "inspect". */
  inspect: InspectState | null
  /** Currently held pan keys (arrows), maintained by the canvas hook. */
  keys: Set<string>
  /** Loading-harbor vehicle queue state. */
  harbor: HarborState
  /**
   * External readiness gate for the loading screen: the harbor holds until
   * this is true (and the minimum dwell has elapsed). Defaults true so a plain
   * sea scene never waits on it.
   */
  ready: boolean
  /**
   * Space-bar cast-off: skips the dock's dwell/readiness gates and departs
   * immediately, and keeps a still-pending run out at sea instead of snapping
   * it back to the dock. Cleared whenever the scene re-berths, so the skip
   * works on every visit to the loading dock.
   */
  castOff: boolean
  onShipClick?: () => void
}

const MAX_WAKE = 120

const SPEED_TARGET: Record<VoyageStatus["mode"], number> = {
  pending: 0.05,
  sailing: 1,
  arrived: 0.15,
  failed: 0.1,
  blocked: 0.3,
}

/** Ship x-fraction on open water. */
const SEA_X = 0.5
/** Cast-off budget before the pull-out: last vehicles board, the ramp swings
 *  up, then the door plate seals (updateHarbor drives the actual phases). */
const DOOR_DUR = 3.0
/** Beat after the door seals before the ship starts pulling out. */
const DEPART_HOLD = 0.3
/** Sail-away top speed, ground units/s. */
const DEPART_SPEED = 90
/** Fade of the (now shipless) harbor once the ferry has cleared the screen. */
const DEPART_FADE_DUR = 0.6
/** Empty-ocean beat before the at-sea ferry enters from the bottom-left. */
const SEA_ENTER_HOLD = 0.7
const SEA_ENTER_DUR = 2
/** Cross-fade into the destination scene at the start of the arrive stage. */
const ARRIVE_FADE_DUR = 0.5
/** Approach slide from off-screen to the destination berth. */
const ARRIVE_SLIDE_DUR = 4
/** Minimum seconds the loading harbor is shown before the ferry may depart. */
export const HARBOR_MIN_DUR = 5

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function createScene(): SceneState {
  return {
    mode: "sea",
    stage: "sea",
    stageT: 0,
    departFade: 1,
    arriveFade: 0,
    shipG: 0,
    shipV: 0,
    seaEnter: 1,
    shipXFrac: SEA_X,
    doorT: 1,
    t: 0,
    bufW: 0,
    bufH: 0,
    scrollX: 0,
    scrollY: 0,
    progress: 0,
    speed: 0.5,
    voyage: {
      target: 0,
      mode: "pending",
      stop: 0,
      prReady: false,
    },
    wake: [],
    wakeTimer: 0,
    shipRect: { x: 0, y: 0, w: 0, h: 0 },
    inspect: null,
    keys: new Set(),
    harbor: createHarborState(),
    ready: true,
    castOff: false,
  }
}

/** Inspection (click-the-ship cutaway) is only offered once at open water. */
export function canInspect(s: SceneState): boolean {
  return s.stage === "sea" && s.seaEnter >= 1
}

/**
 * Snap the spatial stage to whatever the run status implies, with no
 * transition animation. Used on mount and for reduced-motion still frames so
 * a refresh lands directly in the right scene.
 */
export function snapStage(s: SceneState, opts?: { forceDock?: boolean }) {
  // A fresh launch forces the loading harbor even when the run is already
  // active (dummy runs never report "pending"); the harbor then departs on
  // its own timer.
  if (opts?.forceDock && s.voyage.mode !== "arrived") {
    snapDock(s)
    return
  }
  switch (s.voyage.mode) {
    case "pending":
      // A space-bar cast-off keeps a pending run at sea instead of the dock.
      if (!s.castOff) {
        snapDock(s)
        return
      }
      snapSea(s)
      break
    case "arrived":
      s.stage = "docked"
      s.shipG = 0
      s.shipV = 0
      s.departFade = 1
      s.arriveFade = 1
      s.seaEnter = 1
      s.doorT = 1
      s.speed = 0
      break
    default:
      snapSea(s)
      break
  }
  s.shipXFrac = SEA_X
  s.stageT = 0
}

function snapSea(s: SceneState) {
  s.stage = "sea"
  s.shipG = 0
  s.shipV = 0
  s.departFade = 1
  s.arriveFade = 0
  s.seaEnter = 1
  s.doorT = 1
}

function snapDock(s: SceneState) {
  s.castOff = false
  s.stage = "dock"
  s.shipG = 0
  s.shipV = 0
  s.departFade = 0
  s.arriveFade = 0
  s.seaEnter = 1
  s.doorT = 0
  s.speed = 0
  s.shipXFrac = SEA_X
  s.stageT = 0
}

function setStage(s: SceneState, stage: VoyageStage) {
  s.stage = stage
  s.stageT = 0
}

function updateStage(s: SceneState, dt: number) {
  s.stageT += dt
  const mode = s.voyage.mode

  switch (s.stage) {
    case "dock":
      s.shipG = 0
      s.shipV = 0
      s.departFade = 0
      s.doorT = 0
      // Depart once the run is actually moving AND the loading screen has had
      // its minimum dwell and any crucial assets are ready (max of the two).
      // A space-bar cast-off skips all of those gates.
      if (mode === "arrived") snapStage(s)
      else if (
        s.castOff ||
        (mode !== "pending" && s.stageT >= HARBOR_MIN_DUR && s.ready)
      ) {
        setStage(s, "depart")
      }
      break
    case "depart": {
      // The stern door seals and the ramp stows; after a beat the ferry
      // pulls out along its heading and exits up-right off-screen, then the
      // shipless harbor fades into the open sea.
      s.doorT = clamp01(s.stageT / DOOR_DUR)
      if (s.stageT >= DOOR_DUR + DEPART_HOLD) {
        s.shipV = Math.min(DEPART_SPEED, s.shipV + DEPART_SPEED * dt * 0.9)
        s.shipG += s.shipV * dt
      }
      if (departShipOffscreen(s)) {
        s.departFade = clamp01(s.departFade + dt / DEPART_FADE_DUR)
        if (s.departFade >= 1) {
          setStage(s, "sea")
          s.seaEnter = 0
          s.shipG = 0
          s.shipV = 0
        }
      }
      break
    }
    case "sea":
      // Entry from departure: a beat of empty ocean, then the ferry slides
      // in from the bottom-left and locks at the screen center.
      if (s.seaEnter < 1) {
        s.seaEnter = clamp01((s.stageT - SEA_ENTER_HOLD) / SEA_ENTER_DUR)
      }
      if (mode === "arrived") {
        setStage(s, "arrive")
        s.arriveFade = 0
        s.shipG = destApproachStartG(s)
      } else if (mode === "pending" && !s.castOff) snapStage(s)
      break
    case "arrive": {
      // Cross-fade the small at-sea ferry into the destination harbor scene,
      // where the big ferry approaches from off the bottom-left and moors.
      s.arriveFade = clamp01(s.stageT / ARRIVE_FADE_DUR)
      const start = destApproachStartG(s)
      const p = clamp01((s.stageT - ARRIVE_FADE_DUR) / ARRIVE_SLIDE_DUR)
      s.shipG = start * (1 - easeOutCubic(p))
      if (p >= 1) {
        setStage(s, "docked")
        s.shipG = 0
      }
      break
    }
    case "docked":
      s.shipG = 0
      s.arriveFade = 1
      if (mode === "sailing") snapStage(s)
      else if (mode === "pending") snapStage(s)
      break
  }
}

/** Top-left blit position of the at-sea ferry (center, entering from the
 *  bottom-left along the iso heading while seaEnter < 1). */
export function shipBlitPos(s: SceneState): { x: number; y: number } {
  const underway = s.voyage.mode === "sailing" ? 1 : 0
  const surge = Math.round(Math.sin(s.t * 0.9) * 2 * underway)
  const heave = Math.round(Math.sin(s.t * 0.7) * underway)
  const enter = (1 - easeInOutCubic(s.seaEnter)) * s.bufW * 0.4
  return {
    x: Math.floor(s.bufW * s.shipXFrac - FERRY_ANCHOR.x + surge - enter * 2),
    y: Math.floor(s.bufH * 0.55 - FERRY_ANCHOR.y + heave + enter),
  }
}

/** Vertical hull bob, shared by the sea renderer and the inspect handoff. */
export function shipBobOffset(s: SceneState): number {
  const bobRate = s.voyage.mode === "failed" ? 1.2 : 2.1
  return Math.round(Math.sin(s.t * bobRate) * 2.2)
}

export function updateScene(s: SceneState, dt: number) {
  s.t += dt
  updateStage(s, dt)
  if (s.stage === "dock" || s.stage === "depart") updateHarbor(s, dt)
  if (s.stage === "arrive" || s.stage === "docked") updateDestination(s, dt)

  const ease = Math.min(1, dt * 0.8)
  s.progress += (s.voyage.target - s.progress) * ease
  let speedTarget = SPEED_TARGET[s.voyage.mode]
  if (s.stage === "dock" || s.stage === "docked") speedTarget = 0
  else if (s.stage === "arrive") speedTarget = 0.1
  s.speed += (speedTarget - s.speed) * Math.min(1, dt * 1.5)

  // Water drifts down-left, opposite the bow heading (up-right).
  s.scrollX += SEA_VX * s.speed * dt
  s.scrollY -= SEA_VY * s.speed * dt

  // Wake foam shed at the stern while the ship has way on (and is actually
  // in the water — not while it's lifted out for inspection, and only once
  // the at-sea ferry is on stage).
  s.wakeTimer -= dt
  const seaShipShown = s.stage === "sea" && s.seaEnter > 0
  if (
    s.mode === "sea" &&
    seaShipShown &&
    s.speed > 0.3 &&
    s.wakeTimer <= 0 &&
    s.bufW > 0
  ) {
    s.wakeTimer = 0.12
    const pos = shipBlitPos(s)
    const n = 1 + (Math.random() < 0.4 ? 1 : 0)
    for (let i = 0; i < n; i++) {
      s.wake.push({
        x: pos.x + FERRY_STERN.x + (Math.random() * 10 - 5),
        y: pos.y + FERRY_STERN.y + (Math.random() * 5 - 2),
        vx: -SEA_VX * s.speed + (Math.random() * 9 - 4.5),
        vy: SEA_VY * s.speed + (Math.random() * 4.5 - 2.25),
        age: 0,
        life: 1.8 + Math.random() * 1.2,
      })
    }
    while (s.wake.length > MAX_WAKE) s.wake.shift()
  }
  for (let i = s.wake.length - 1; i >= 0; i--) {
    const p = s.wake[i]
    p.age += dt
    if (p.age >= p.life) {
      s.wake.splice(i, 1)
      continue
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
  }
}
