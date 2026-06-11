// Resident Evil-style prop inspection of the ferry. Clicking the ship lifts
// it out of the scene, spins it ~1.6 revolutions while the camera pulls in
// (constant screen-pixel size: the voxel model is re-rendered at increasing
// art resolution, so closeness reveals detail), and settles holding the port
// profile, bow pointing left. While held the view can be panned with mouse
// drag or arrow keys — no rotation. Esc / click-outside reverses back into
// the bobbing at-sea position.
//
// The state machine is parameter-sourced (each phase eases from captured
// `from*` values), so an Esc mid-entrance retargets smoothly instead of
// snapping.

import {
  shipBlitPos,
  shipBobOffset,
  type SceneState,
} from "./scene"
import { COLORS, type Sprites } from "./sprites"
import { BAKED_YAW, BAKED_ZOOM, FERRY_GEOM } from "./voxel/bake"
import {
  FERRY_CENTER_3D,
  FERRY_LX,
  FERRY_LY,
  FERRY_LZ,
} from "./voxel/ferry-model"
import {
  createVoxelTarget,
  projectPoint,
  renderVoxels,
  type VoxelCam,
  type VoxelTarget,
} from "./voxel/voxel-render"

const TWO_PI = Math.PI * 2
/** Port profile, bow pointing left. */
const HOLD_YAW = Math.PI
/** Extra full revolutions the entrance spin makes before settling. */
const ENTER_REVS = 2
const ENTER_DUR = 1.7
const EXIT_DUR = 1.1
const PAN_SPEED = 210
/** Minimum art px of ship kept on-screen while panning. */
const PAN_MARGIN_X = 72
const PAN_MARGIN_Y = 48
const DIM_MAX = 0.65

/** Offscreen buffer for the live voxel render; sized for the max hold zoom. */
const BUF_W = 480
const BUF_H = 360
const MAX_ZOOM = 10

export interface InspectState {
  phase: "enter" | "hold" | "exit"
  /** Phase-local seconds. */
  t: number
  yaw: number
  zoom: number
  /** Screen position of the ship's spin pivot, art px. */
  x: number
  y: number
  panX: number
  panY: number
  /** 0..1 background dim. */
  dim: number
  // Eased-from values, captured at the start of the current phase.
  fromYaw: number
  toYaw: number
  fromZoom: number
  fromX: number
  fromY: number
  fromPanX: number
  fromPanY: number
  fromDim: number
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

function holdZoom(s: SceneState): number {
  return Math.min(MAX_ZOOM, Math.max(3, (s.bufW * 0.5) / FERRY_LX))
}

function holdX(s: SceneState): number {
  return Math.floor(s.bufW * 0.5)
}

function holdY(s: SceneState): number {
  return Math.floor(s.bufH * 0.45)
}

export function enterInspect(s: SceneState) {
  if (s.mode !== "sea") return
  const home = homePivot(s)
  s.mode = "inspect"
  s.inspect = {
    phase: "enter",
    t: 0,
    yaw: BAKED_YAW,
    zoom: BAKED_ZOOM,
    x: home.x,
    y: home.y,
    panX: 0,
    panY: 0,
    dim: 0,
    fromYaw: BAKED_YAW,
    toYaw: HOLD_YAW - TWO_PI * ENTER_REVS,
    fromZoom: BAKED_ZOOM,
    fromX: home.x,
    fromY: home.y,
    fromPanX: 0,
    fromPanY: 0,
    fromDim: 0,
  }
}

export function exitInspect(s: SceneState) {
  const ins = s.inspect
  if (!ins || ins.phase === "exit") return
  // Normalize, then unwind forward one-ish revolution back to the heading.
  const fromYaw = ((ins.yaw % TWO_PI) + TWO_PI) % TWO_PI
  ins.phase = "exit"
  ins.t = 0
  ins.fromYaw = fromYaw
  ins.toYaw = BAKED_YAW + TWO_PI
  ins.fromZoom = ins.zoom
  ins.fromX = ins.x
  ins.fromY = ins.y
  ins.fromPanX = ins.panX
  ins.fromPanY = ins.panY
  ins.fromDim = ins.dim
}

/**
 * Reduced-motion path: jump the current transition straight to its end pose
 * (entering → held side view, exiting → back at sea). The caller redraws a
 * still frame afterwards.
 */
export function snapInspect(s: SceneState) {
  const ins = s.inspect
  if (!ins) return
  if (ins.phase === "exit") {
    s.mode = "sea"
    s.inspect = null
    return
  }
  ins.phase = "hold"
  ins.yaw = HOLD_YAW
  updateInspect(s, 0) // hold branch fills zoom/x/y/dim from the layout
}

export function updateInspect(s: SceneState, dt: number) {
  const ins = s.inspect
  if (!ins) return
  ins.t += dt

  if (ins.phase === "enter") {
    const p = clamp01(ins.t / ENTER_DUR)
    const e = easeInOutCubic(p)
    ins.yaw = lerp(ins.fromYaw, ins.toYaw, easeInOutQuint(p))
    ins.zoom = lerp(ins.fromZoom, holdZoom(s), e)
    ins.x = lerp(ins.fromX, holdX(s), e)
    // A bell-curve lift so the ship visibly rises out of the water first.
    ins.y = lerp(ins.fromY, holdY(s), e) - Math.sin(Math.PI * p) * 12
    ins.dim = clamp01(p / 0.4) * DIM_MAX
    if (p >= 1) {
      ins.phase = "hold"
      ins.t = 0
      ins.yaw = HOLD_YAW
    }
    return
  }

  if (ins.phase === "hold") {
    // Track layout so window resizes can't strand the ship.
    ins.zoom = holdZoom(s)
    ins.x = holdX(s)
    ins.y = holdY(s)
    ins.dim = DIM_MAX
    const step = PAN_SPEED * dt
    if (s.keys.has("ArrowLeft")) ins.panX -= step
    if (s.keys.has("ArrowRight")) ins.panX += step
    if (s.keys.has("ArrowUp")) ins.panY -= step
    if (s.keys.has("ArrowDown")) ins.panY += step
    clampPan(s, ins)
    return
  }

  // exit
  const p = clamp01(ins.t / EXIT_DUR)
  const e = easeInOutCubic(p)
  const home = homePivot(s) // live target: the at-sea ship keeps bobbing
  ins.yaw = lerp(ins.fromYaw, ins.toYaw, e)
  ins.zoom = lerp(ins.fromZoom, BAKED_ZOOM, e)
  ins.x = lerp(ins.fromX, home.x, e)
  ins.y = lerp(ins.fromY, home.y, e)
  ins.panX = lerp(ins.fromPanX, 0, e)
  ins.panY = lerp(ins.fromPanY, 0, e)
  ins.dim = lerp(ins.fromDim, 0, clamp01(p / 0.7))
  if (p >= 1) {
    s.mode = "sea"
    s.inspect = null
  }
}

/** Ship bbox relative to the pivot at the current yaw/zoom. */
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
    pz: FERRY_CENTER_3D.z,
  }
}

// One reusable render target; re-rendered only when yaw/zoom change, so the
// held pose costs nothing but a blit while panning.
let target: VoxelTarget | null = null
let lastYaw = NaN
let lastZoom = NaN

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
  if (lastYaw !== ins.yaw || lastZoom !== ins.zoom) {
    renderVoxels(target, sprites.ferryModel, inspectCam(ins), COLORS.outline)
    lastYaw = ins.yaw
    lastZoom = ins.zoom
  }

  const bx = Math.floor(ins.x + ins.panX) - BUF_W / 2
  const by = Math.floor(ins.y + ins.panY) - BUF_H / 2
  ctx.drawImage(target.canvas, bx, by)

  // Keep the hit rect live for the click-outside-exits test.
  const b = shipBounds(ins)
  s.shipRect = {
    x: Math.floor(ins.x + ins.panX + b.minX),
    y: Math.floor(ins.y + ins.panY + b.minY),
    w: Math.ceil(b.maxX - b.minX),
    h: Math.ceil(b.maxY - b.minY),
  }
}
