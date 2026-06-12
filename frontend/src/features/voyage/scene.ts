// Voyage scene state + simulation step. All of this lives in refs and is
// mutated by the render loop — React never re-renders per frame.

import { SEA_VX, SEA_VY, horizonY } from "./sea"
import { FERRY_ANCHOR, FERRY_STERN } from "./sprites"
import type { VoyageStatus } from "./progress"
import type { InspectState } from "./inspect"
import { createHarborState, updateHarbor, type HarborState } from "./harbor"

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

export interface CloudInst {
  x: number
  y: number
  idx: number
}

export interface SceneState {
  mode: SceneMode
  stage: VoyageStage
  /** Seconds in the current stage. */
  stageT: number
  /** Harbor→sea cross-fade, 0 = harbor fully shown .. 1 = faded out to sea. */
  departFade: number
  /** Crane/cargo animation clock, runs while at the loading dock. */
  craneT: number
  /** 0..1 destination-harbor approach (1 = moored alongside). */
  arrival: number
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
  clouds: CloudInst[]
  bird: { x: number; baseY: number; phase: number } | null
  birdTimer: number
  /** Ship blit rect in art px, refreshed by render; used for click hit-tests. */
  shipRect: { x: number; y: number; w: number; h: number }
  /** Live prop-inspection state while mode === "inspect". */
  inspect: InspectState | null
  /** Currently held pan keys (arrows), maintained by the canvas hook. */
  keys: Set<string>
  /** Loading-harbor vehicle queue + crane animation state. */
  harbor: HarborState
  /**
   * External readiness gate for the loading screen: the harbor holds until
   * this is true (and the minimum dwell has elapsed). Defaults true so a plain
   * sea scene never waits on it.
   */
  ready: boolean
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

/** Ship x-fraction while berthed (dock on the left, bow already pointed out). */
const BERTH_X = 0.6
/** Ship x-fraction on open water. */
const SEA_X = 0.5
const DOOR_DUR = 1.2
/** Cross-fade time from the berthed harbor to the open-sea scene. */
const DEPART_FADE_DUR = 1.1
/** Beat after the door seals before the cross-fade begins. */
const DEPART_HOLD = 0.2
const ARRIVE_DUR = 4
/** Minimum seconds the loading harbor is shown before the ferry may depart. */
export const HARBOR_MIN_DUR = 5

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function createScene(): SceneState {
  return {
    mode: "sea",
    stage: "sea",
    stageT: 0,
    departFade: 1,
    craneT: 0,
    arrival: 0,
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
    clouds: [
      { x: 45, y: 12, idx: 0 },
      { x: 270, y: 33, idx: 1 },
      { x: 480, y: 21, idx: 2 },
    ],
    bird: null,
    birdTimer: 12,
    shipRect: { x: 0, y: 0, w: 0, h: 0 },
    inspect: null,
    keys: new Set(),
    harbor: createHarborState(),
    ready: true,
  }
}

/** Inspection (click-the-ship cutaway) is only offered once at open water. */
export function canInspect(s: SceneState): boolean {
  return s.stage === "sea" || s.stage === "arrive" || s.stage === "docked"
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
    s.stage = "dock"
    s.shipXFrac = BERTH_X
    s.departFade = 0
    s.doorT = 0
    s.arrival = 0
    s.speed = 0
    s.stageT = 0
    return
  }
  switch (s.voyage.mode) {
    case "pending":
      s.stage = "dock"
      s.shipXFrac = BERTH_X
      s.departFade = 0
      s.doorT = 0
      s.arrival = 0
      s.speed = 0
      break
    case "arrived":
      s.stage = "docked"
      s.shipXFrac = SEA_X
      s.departFade = 1
      s.doorT = 1
      s.arrival = 1
      s.speed = 0
      break
    default:
      s.stage = "sea"
      s.shipXFrac = SEA_X
      s.departFade = 1
      s.doorT = 1
      s.arrival = 0
      break
  }
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
      s.craneT += dt
      s.shipXFrac = BERTH_X
      s.departFade = 0
      s.doorT = 0
      // Depart once the run is actually moving AND the loading screen has had
      // its minimum dwell and any crucial assets are ready (max of the two).
      if (mode === "arrived") snapStage(s)
      else if (mode !== "pending" && s.stageT >= HARBOR_MIN_DUR && s.ready) {
        setStage(s, "depart")
      }
      break
    case "depart": {
      // The stern door seals first; after a beat the big berthed harbor
      // cross-fades into the smaller open-sea ferry (a cut, not a slide).
      s.doorT = clamp01(s.stageT / DOOR_DUR)
      const fadeStart = DOOR_DUR + DEPART_HOLD
      s.departFade = easeInOutCubic(clamp01((s.stageT - fadeStart) / DEPART_FADE_DUR))
      s.shipXFrac = BERTH_X + (SEA_X - BERTH_X) * s.departFade
      if (s.stageT >= fadeStart + DEPART_FADE_DUR) setStage(s, "sea")
      break
    }
    case "sea":
      if (mode === "arrived") setStage(s, "arrive")
      else if (mode === "pending") snapStage(s)
      break
    case "arrive":
      if (s.stageT >= ARRIVE_DUR) setStage(s, "docked")
      break
    case "docked":
      if (mode === "sailing") snapStage(s)
      else if (mode === "pending") snapStage(s)
      break
  }
}

/** Top-left blit position keeping the ferry centered (a touch below middle). */
export function shipBlitPos(s: SceneState): { x: number; y: number } {
  const underway = s.voyage.mode === "sailing" ? 1 : 0
  const surge = Math.round(Math.sin(s.t * 0.9) * 2 * underway)
  const heave = Math.round(Math.sin(s.t * 0.7) * underway)
  return {
    x: Math.floor(s.bufW * s.shipXFrac - FERRY_ANCHOR.x + surge),
    y: Math.floor(s.bufH * 0.55 - FERRY_ANCHOR.y + heave),
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

  const ease = Math.min(1, dt * 0.8)
  s.progress += (s.voyage.target - s.progress) * ease
  let speedTarget = SPEED_TARGET[s.voyage.mode]
  if (s.stage === "dock" || s.stage === "docked") speedTarget = 0
  else if (s.stage === "arrive") speedTarget = 0.1
  s.speed += (speedTarget - s.speed) * Math.min(1, dt * 1.5)

  // Destination harbor: peeks over the horizon late in the voyage, then
  // closes alongside during the arrive stage.
  const arrivalTarget =
    s.stage === "arrive" || s.stage === "docked"
      ? 1
      : s.stage === "sea" && s.voyage.mode === "sailing" && s.progress > 0.9
        ? Math.min(0.5, (s.progress - 0.9) * 5)
        : 0
  s.arrival += (arrivalTarget - s.arrival) * Math.min(1, dt * 0.9)

  // Water drifts down-left, opposite the bow heading (up-right).
  s.scrollX += SEA_VX * s.speed * dt
  s.scrollY -= SEA_VY * s.speed * dt

  // Wake foam shed at the stern while the ship has way on (and is actually
  // in the water — not while it's lifted out for inspection).
  s.wakeTimer -= dt
  if (s.mode === "sea" && s.speed > 0.3 && s.wakeTimer <= 0 && s.bufW > 0) {
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

  // Clouds: far parallax, ~0.3× sea speed.
  for (const c of s.clouds) {
    c.x -= (SEA_VX * 0.3 * s.speed + 2.25) * dt
    if (c.x < -60) {
      c.x = s.bufW + 30 + Math.random() * 90
      c.y = 6 + Math.random() * Math.max(12, horizonY(s.bufH) - 27)
    }
  }

  // The occasional passing bird.
  if (s.bird) {
    s.bird.x += 24 * dt
    if (s.bird.x > s.bufW + 15) s.bird = null
  } else {
    s.birdTimer -= dt
    if (s.birdTimer <= 0 && s.bufH > 0) {
      s.birdTimer = 14 + Math.random() * 16
      s.bird = {
        x: -12,
        baseY: 9 + Math.random() * Math.max(9, horizonY(s.bufH) * 0.6),
        phase: Math.random() * Math.PI * 2,
      }
    }
  }
}
