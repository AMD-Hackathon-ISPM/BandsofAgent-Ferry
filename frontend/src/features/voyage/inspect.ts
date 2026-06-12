// Ship inspection: clicking the ferry lifts it out of the scene, spins it
// while the camera pulls in, locks the port profile (bow left), then the
// camera levels out — the 2:1 iso squash flattens into a true orthographic
// side elevation — and the hull wall fades away, revealing the 2D room
// cutaway (see ./cutaway). While held, the view pans (drag/arrows) and zooms
// (wheel) in integer voxel steps. Esc / click-outside reverses the journey.
//
// The state machine is parameter-sourced: each phase eases from a captured
// `from` pose, so an Esc mid-transition retargets smoothly instead of
// snapping. Phase chain:
//   enterSpin → flatten → reveal → hold → conceal → unflatten → exitSpin

import { canInspect, shipBlitPos, shipBobOffset, type SceneState } from "./scene"
import { COLORS, type Sprites } from "./sprites"
import { BAKED_YAW, BAKED_ZOOM, FERRY_GEOM } from "./voxel/bake"
import { FERRY_CENTER_3D, FERRY_LX, FERRY_LY, FERRY_LZ } from "./voxel/ferry-model"
import {
  KZ,
  createVoxelTarget,
  projectPoint,
  renderVoxels,
  type VoxelCam,
  type VoxelTarget,
} from "./voxel/voxel-render"
import { CUTAWAY_PZ, getInteriorCanvas } from "./cutaway/cutaway-render"
import { drawInteriorAnimations } from "./cutaway/interior-art"

const TWO_PI = Math.PI * 2
/** Port profile, bow pointing left. */
const HOLD_YAW = Math.PI
/** Extra full revolutions the entrance spin makes before settling. */
const ENTER_REVS = 2
const ENTER_DUR = 1.4
const FLATTEN_DUR = 0.8
const REVEAL_DUR = 0.6
const CONCEAL_DUR = 0.35
const UNFLATTEN_DUR = 0.6
const EXIT_DUR = 1.1
const PAN_SPEED = 210
/** Minimum art px of ship kept on-screen while panning. */
const PAN_MARGIN_X = 72
const PAN_MARGIN_Y = 48
const DIM_MAX = 0.65

/**
 * Offscreen buffer for the live voxel render; must fit the flattened ship at
 * the max cutaway zoom (120 voxels · 6 = 720 px wide, 69 · 6 = 414 tall).
 */
const BUF_W = 768
const BUF_H = 480
const MAX_SPIN_ZOOM = 3
/** Wheel-zoom bounds around the layout-derived cutaway zoom. */
const MIN_CUTAWAY_ZOOM = 2
const MAX_CUTAWAY_ZOOM = 6

export type InspectPhase =
  | "enterSpin"
  | "flatten"
  | "reveal"
  | "hold"
  | "conceal"
  | "unflatten"
  | "exitSpin"

/** The full camera/cutaway pose; phases ease between captured poses. */
interface Pose {
  yaw: number
  /** 0.5 iso … 0 flat side elevation. */
  tilt: number
  /** Vertical px per voxel (KZ iso … 1 square). */
  kz: number
  /** Model-space pivot z. */
  pz: number
  zoom: number
  /** Screen position of the pivot, art px. */
  x: number
  y: number
  panX: number
  panY: number
  /** 0..1 background dim. */
  dim: number
  /** 0 hull intact … 1 interior exposed. */
  reveal: number
}

export interface InspectState extends Pose {
  phase: InspectPhase
  /** Phase-local seconds. */
  t: number
  /** Spin-phase yaw target (the long unwinding lerp). */
  toYaw: number
  /** Integer wheel-zoom offset from the layout default while holding. */
  zoomStep: number
  /** Pose captured at the start of the current phase. */
  from: Pose
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2
}

function capture(ins: InspectState): Pose {
  return {
    yaw: ins.yaw,
    tilt: ins.tilt,
    kz: ins.kz,
    pz: ins.pz,
    zoom: ins.zoom,
    x: ins.x,
    y: ins.y,
    panX: ins.panX,
    panY: ins.panY,
    dim: ins.dim,
    reveal: ins.reveal,
  }
}

function setPhase(ins: InspectState, phase: InspectPhase) {
  ins.from = capture(ins)
  ins.phase = phase
  ins.t = 0
}

/** Where the spin pivot sits inside the baked at-sea sprite. */
const PIVOT_SPRITE = projectPoint(
  FERRY_CENTER_3D.x,
  FERRY_CENTER_3D.y,
  FERRY_CENTER_3D.z,
  FERRY_GEOM.cam
)

/** The pivot's current scene position while the ship sails (it bobs). */
function homePivot(s: SceneState): { x: number; y: number } {
  const pos = shipBlitPos(s)
  return {
    x: pos.x + PIVOT_SPRITE.x,
    y: pos.y + shipBobOffset(s) + PIVOT_SPRITE.y,
  }
}

function spinZoom(s: SceneState): number {
  return Math.min(MAX_SPIN_ZOOM, Math.max(1.5, (s.bufW * 0.45) / FERRY_LX))
}

/** Layout-derived cutaway zoom plus the user's integer wheel offset. */
function cutawayZoom(s: SceneState, step: number): number {
  const base = Math.min(5, Math.max(3, Math.floor((s.bufW * 0.8) / FERRY_LX)))
  return Math.min(MAX_CUTAWAY_ZOOM, Math.max(MIN_CUTAWAY_ZOOM, base + step))
}

function holdX(s: SceneState): number {
  return Math.floor(s.bufW * 0.5)
}

function holdY(s: SceneState): number {
  return Math.floor(s.bufH * 0.45)
}

function cutawayY(s: SceneState): number {
  return Math.floor(s.bufH * 0.48)
}

export function enterInspect(s: SceneState) {
  if (s.mode !== "sea" || !canInspect(s)) return
  const home = homePivot(s)
  s.mode = "inspect"
  const pose: Pose = {
    yaw: BAKED_YAW,
    tilt: 0.5,
    kz: KZ,
    pz: FERRY_CENTER_3D.z,
    zoom: BAKED_ZOOM,
    x: home.x,
    y: home.y,
    panX: 0,
    panY: 0,
    dim: 0,
    reveal: 0,
  }
  s.inspect = {
    ...pose,
    phase: "enterSpin",
    t: 0,
    toYaw: HOLD_YAW - TWO_PI * ENTER_REVS,
    zoomStep: 0,
    from: pose,
  }
}

/** Begin the journey back; from any phase, jump to its mirror. */
export function exitInspect(s: SceneState) {
  const ins = s.inspect
  if (!ins) return
  switch (ins.phase) {
    case "enterSpin":
      startExitSpin(ins)
      break
    case "flatten":
      setPhase(ins, "unflatten")
      break
    case "reveal":
    case "hold":
      setPhase(ins, "conceal")
      break
    // Already on the way out.
    case "conceal":
    case "unflatten":
    case "exitSpin":
      break
  }
}

function startExitSpin(ins: InspectState) {
  setPhase(ins, "exitSpin")
  // Normalize, then unwind forward one-ish revolution back to the heading.
  ins.from.yaw = ((ins.yaw % TWO_PI) + TWO_PI) % TWO_PI
  ins.yaw = ins.from.yaw
  ins.toYaw = BAKED_YAW + TWO_PI
}

/**
 * Reduced-motion path: jump the current transition straight to its end pose
 * (entering → exposed cutaway, exiting → back at sea). The caller redraws a
 * still frame afterwards.
 */
export function snapInspect(s: SceneState) {
  const ins = s.inspect
  if (!ins) return
  if (
    ins.phase === "conceal" ||
    ins.phase === "unflatten" ||
    ins.phase === "exitSpin"
  ) {
    s.mode = "sea"
    s.inspect = null
    return
  }
  ins.phase = "hold"
  ins.yaw = HOLD_YAW
  ins.tilt = 0
  ins.kz = 1
  ins.pz = CUTAWAY_PZ
  ins.reveal = 1
  updateInspect(s, 0) // hold branch fills zoom/x/y/dim from the layout
}

export function updateInspect(s: SceneState, dt: number) {
  const ins = s.inspect
  if (!ins) return
  ins.t += dt
  const f = ins.from

  switch (ins.phase) {
    case "enterSpin": {
      const p = clamp01(ins.t / ENTER_DUR)
      const e = easeInOutCubic(p)
      ins.yaw = lerp(f.yaw, ins.toYaw, easeInOutQuint(p))
      ins.zoom = lerp(f.zoom, spinZoom(s), e)
      ins.x = lerp(f.x, holdX(s), e)
      // A bell-curve lift so the ship visibly rises out of the water first.
      ins.y = lerp(f.y, holdY(s), e) - Math.sin(Math.PI * p) * 12
      ins.dim = clamp01(p / 0.4) * DIM_MAX
      if (p >= 1) {
        ins.yaw = HOLD_YAW
        setPhase(ins, "flatten")
      }
      return
    }

    case "flatten": {
      // Camera levels out: iso squash → flat side elevation, and the ship
      // grows to the cutaway working scale.
      const p = clamp01(ins.t / FLATTEN_DUR)
      const e = easeInOutCubic(p)
      ins.yaw = HOLD_YAW
      ins.tilt = lerp(f.tilt, 0, e)
      ins.kz = lerp(f.kz, 1, e)
      ins.pz = lerp(f.pz, CUTAWAY_PZ, e)
      ins.zoom = lerp(f.zoom, cutawayZoom(s, ins.zoomStep), e)
      ins.x = lerp(f.x, holdX(s), e)
      ins.y = lerp(f.y, cutawayY(s), e)
      ins.dim = DIM_MAX
      if (p >= 1) setPhase(ins, "reveal")
      return
    }

    case "reveal": {
      const p = clamp01(ins.t / REVEAL_DUR)
      ins.reveal = lerp(f.reveal, 1, easeInOutCubic(p))
      if (p >= 1) setPhase(ins, "hold")
      return
    }

    case "hold": {
      // Track layout so window resizes can't strand the ship.
      ins.zoom = cutawayZoom(s, ins.zoomStep)
      ins.x = holdX(s)
      ins.y = cutawayY(s)
      ins.dim = DIM_MAX
      ins.reveal = 1
      const step = PAN_SPEED * dt
      if (s.keys.has("ArrowLeft")) ins.panX -= step
      if (s.keys.has("ArrowRight")) ins.panX += step
      if (s.keys.has("ArrowUp")) ins.panY -= step
      if (s.keys.has("ArrowDown")) ins.panY += step
      clampPan(s, ins)
      return
    }

    case "conceal": {
      const p = clamp01(ins.t / CONCEAL_DUR)
      ins.reveal = lerp(f.reveal, 0, easeInOutCubic(p))
      if (p >= 1) setPhase(ins, "unflatten")
      return
    }

    case "unflatten": {
      const p = clamp01(ins.t / UNFLATTEN_DUR)
      const e = easeInOutCubic(p)
      ins.tilt = lerp(f.tilt, 0.5, e)
      ins.kz = lerp(f.kz, KZ, e)
      ins.pz = lerp(f.pz, FERRY_CENTER_3D.z, e)
      ins.zoom = lerp(f.zoom, spinZoom(s), e)
      ins.x = lerp(f.x, holdX(s), e)
      ins.y = lerp(f.y, holdY(s), e)
      ins.panX = lerp(f.panX, 0, e)
      ins.panY = lerp(f.panY, 0, e)
      if (p >= 1) startExitSpin(ins)
      return
    }

    case "exitSpin": {
      const p = clamp01(ins.t / EXIT_DUR)
      const e = easeInOutCubic(p)
      const home = homePivot(s) // live target: the at-sea ship keeps bobbing
      ins.yaw = lerp(f.yaw, ins.toYaw, e)
      ins.zoom = lerp(f.zoom, BAKED_ZOOM, e)
      ins.x = lerp(f.x, home.x, e)
      ins.y = lerp(f.y, home.y, e)
      ins.panX = lerp(f.panX, 0, e)
      ins.panY = lerp(f.panY, 0, e)
      ins.dim = lerp(f.dim, 0, clamp01(p / 0.7))
      if (p >= 1) {
        s.mode = "sea"
        s.inspect = null
      }
      return
    }
  }
}

/** Wheel zoom while holding the cutaway, in integer voxel steps. */
export function zoomInspect(s: SceneState, dir: number): boolean {
  const ins = s.inspect
  if (!ins || ins.phase !== "hold") return false
  const before = cutawayZoom(s, ins.zoomStep)
  ins.zoomStep += dir > 0 ? 1 : -1
  const after = cutawayZoom(s, ins.zoomStep)
  // Re-clamp the step so it can't wander past the bounds invisibly.
  ins.zoomStep = after - cutawayZoom(s, 0)
  if (after === before) return false
  ins.zoom = after
  clampPan(s, ins)
  return true
}

/** Ship bbox relative to the pivot at the current camera pose. */
function shipBounds(ins: InspectState): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  const cam = inspectCam(ins)
  const probe: VoxelCam = { ...cam, ox: 0, oy: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const x of [0, FERRY_LX]) {
    for (const y of [0, FERRY_LY]) {
      for (const z of [0, FERRY_LZ]) {
        const p = projectPoint(x, y, z, probe)
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
    }
  }
  return { minX, minY, maxX, maxY }
}

export function clampPan(s: SceneState, ins: InspectState) {
  const b = shipBounds(ins)
  const loX = PAN_MARGIN_X - b.maxX - ins.x
  const hiX = s.bufW - PAN_MARGIN_X - b.minX - ins.x
  const loY = PAN_MARGIN_Y - b.maxY - ins.y
  const hiY = s.bufH - PAN_MARGIN_Y - b.minY - ins.y
  ins.panX = Math.min(hiX, Math.max(loX, ins.panX))
  ins.panY = Math.min(hiY, Math.max(loY, ins.panY))
}

function inspectCam(ins: InspectState): VoxelCam {
  return {
    yaw: ins.yaw,
    zoom: ins.zoom,
    ox: BUF_W / 2,
    oy: BUF_H / 2,
    px: FERRY_CENTER_3D.x,
    py: FERRY_CENTER_3D.y,
    pz: ins.pz,
    tilt: ins.tilt,
    kz: ins.kz,
  }
}

// One reusable render target; re-rendered only when the camera pose changes,
// so the held pose costs nothing but blits while panning.
let target: VoxelTarget | null = null
let lastYaw = NaN
let lastZoom = NaN
let lastTilt = NaN
let lastKz = NaN
let lastPz = NaN

export function drawInspect(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites
) {
  const ins = s.inspect
  if (!ins) return

  // Dim + stepped vignette (no gradients — keeps the pixel-art read).
  if (ins.dim > 0.01) {
    ctx.fillStyle = `rgba(8, 12, 26, ${ins.dim})`
    ctx.fillRect(0, 0, s.bufW, s.bufH)
    const steps: Array<[number, number, number]> = [
      [0, 3, 0.3],
      [3, 3, 0.18],
      [6, 3, 0.1],
    ]
    const a = ins.dim / DIM_MAX
    for (const [inset, t, alpha] of steps) {
      ctx.fillStyle = `rgba(4, 7, 18, ${alpha * a})`
      ctx.fillRect(inset, inset, s.bufW - inset * 2, t)
      ctx.fillRect(inset, s.bufH - inset - t, s.bufW - inset * 2, t)
      ctx.fillRect(inset, inset + t, t, s.bufH - (inset + t) * 2)
      ctx.fillRect(s.bufW - inset - t, inset + t, t, s.bufH - (inset + t) * 2)
    }
  }

  if (!target) target = createVoxelTarget(BUF_W, BUF_H)
  if (
    lastYaw !== ins.yaw ||
    lastZoom !== ins.zoom ||
    lastTilt !== ins.tilt ||
    lastKz !== ins.kz ||
    lastPz !== ins.pz
  ) {
    renderVoxels(target, sprites.ferryModel, inspectCam(ins), COLORS.outline)
    lastYaw = ins.yaw
    lastZoom = ins.zoom
    lastTilt = ins.tilt
    lastKz = ins.kz
    lastPz = ins.pz
  }

  const ox = Math.floor(ins.x + ins.panX)
  const oy = Math.floor(ins.y + ins.panY)

  // Interior cross-section beneath the fading shell. Only meaningful at the
  // flat pose (reveal only ramps while tilt is 0 and the zoom is integer).
  if (ins.reveal > 0.01) {
    const zoom = Math.round(ins.zoom)
    const interior = getInteriorCanvas(zoom)
    const ix = ox + Math.round((FERRY_CENTER_3D.x - FERRY_LX) * ins.zoom)
    const iy = oy + Math.round((ins.pz - FERRY_LZ) * ins.zoom)
    ctx.drawImage(interior, ix, iy)
    // Live layer: screen flicker, LEDs, engine glow, steam, lamps, sea.
    drawInteriorAnimations(
      ctx,
      ix,
      iy,
      zoom,
      performance.now() / 1000,
      ins.reveal
    )
    ctx.globalAlpha = Math.max(0, 1 - ins.reveal)
  }
  ctx.drawImage(target.canvas, ox - BUF_W / 2, oy - BUF_H / 2)
  ctx.globalAlpha = 1

  // Keep the hit rect live for the click-outside-exits test.
  const b = shipBounds(ins)
  s.shipRect = {
    x: Math.floor(ins.x + ins.panX + b.minX),
    y: Math.floor(ins.y + ins.panY + b.minY),
    w: Math.ceil(b.maxX - b.minX),
    h: Math.ceil(b.maxY - b.minY),
  }
}
