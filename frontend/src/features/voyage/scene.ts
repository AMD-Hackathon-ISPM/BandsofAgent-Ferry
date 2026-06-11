// Voyage scene state + simulation step. All of this lives in refs and is
// mutated by the render loop — React never re-renders per frame.

import { SEA_VX, SEA_VY, horizonY } from "./sea"
import { FERRY_ANCHOR, FERRY_STERN } from "./sprites"
import { VOYAGE_STOP_COUNT, type VoyageStatus } from "./progress"

/** "zooming" / "interior" are reserved for the click-into-the-ship mode. */
export type SceneMode = "sea" | "zooming" | "interior"

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
  harborRects: Array<{ index: number; x: number; y: number; w: number; h: number }>
  onShipClick?: () => void
  onHarborClick?: (index: number) => void
}

const MAX_WAKE = 80

const SPEED_TARGET: Record<VoyageStatus["mode"], number> = {
  pending: 0.35,
  sailing: 1,
  arrived: 0.15,
  failed: 0.1,
  blocked: 0.3,
}

export function createScene(): SceneState {
  return {
    mode: "sea",
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
      harborStates: Array.from({ length: VOYAGE_STOP_COUNT }, (_, index) =>
        index === 0 ? "active" : "upcoming"
      ),
    },
    wake: [],
    wakeTimer: 0,
    clouds: [
      { x: 30, y: 8, idx: 0 },
      { x: 180, y: 22, idx: 1 },
      { x: 320, y: 14, idx: 2 },
    ],
    bird: null,
    birdTimer: 12,
    shipRect: { x: 0, y: 0, w: 0, h: 0 },
    harborRects: [],
  }
}

/** Top-left blit position keeping the ferry centered (a touch below middle). */
export function shipBlitPos(s: SceneState): { x: number; y: number } {
  const underway = s.voyage.mode === "sailing" ? 1 : 0
  const surge = Math.round(Math.sin(s.t * 0.9) * 2 * underway)
  const heave = Math.round(Math.sin(s.t * 0.7) * underway)
  return {
    x: Math.floor(s.bufW * 0.5 - FERRY_ANCHOR.x + surge),
    y: Math.floor(s.bufH * 0.55 - FERRY_ANCHOR.y + heave),
  }
}

export function updateScene(s: SceneState, dt: number) {
  s.t += dt

  const ease = Math.min(1, dt * 0.8)
  s.progress += (s.voyage.target - s.progress) * ease
  s.speed += (SPEED_TARGET[s.voyage.mode] - s.speed) * Math.min(1, dt * 1.5)

  // Water drifts down-left, opposite the bow heading (up-right).
  s.scrollX += SEA_VX * s.speed * dt
  s.scrollY -= SEA_VY * s.speed * dt

  // Wake foam shed at the stern while the ship has way on.
  s.wakeTimer -= dt
  if (s.speed > 0.3 && s.wakeTimer <= 0 && s.bufW > 0) {
    s.wakeTimer = 0.12
    const pos = shipBlitPos(s)
    const n = 1 + (Math.random() < 0.4 ? 1 : 0)
    for (let i = 0; i < n; i++) {
      s.wake.push({
        x: pos.x + FERRY_STERN.x + (Math.random() * 6 - 3),
        y: pos.y + FERRY_STERN.y + (Math.random() * 3 - 1),
        vx: -SEA_VX * s.speed + (Math.random() * 6 - 3),
        vy: SEA_VY * s.speed + (Math.random() * 3 - 1.5),
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
    c.x -= (SEA_VX * 0.3 * s.speed + 1.5) * dt
    if (c.x < -40) {
      c.x = s.bufW + 20 + Math.random() * 60
      c.y = 4 + Math.random() * Math.max(8, horizonY(s.bufH) - 18)
    }
  }

  // The occasional passing bird.
  if (s.bird) {
    s.bird.x += 16 * dt
    if (s.bird.x > s.bufW + 10) s.bird = null
  } else {
    s.birdTimer -= dt
    if (s.birdTimer <= 0 && s.bufH > 0) {
      s.birdTimer = 14 + Math.random() * 16
      s.bird = {
        x: -8,
        baseY: 6 + Math.random() * Math.max(6, horizonY(s.bufH) * 0.6),
        phase: Math.random() * Math.PI * 2,
      }
    }
  }
}
