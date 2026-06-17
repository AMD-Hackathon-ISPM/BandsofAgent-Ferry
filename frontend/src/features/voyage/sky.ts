import { SEA_VX, SEA_VY } from "./sea"
import type { SceneState } from "./scene"
import type { Sprites } from "./sprites"

export type SkyKind = "cloud" | "gull"

export interface SkyEntity {
  kind: SkyKind
  x: number
  y: number
  alt: number
  vx: number
  vy: number
  flap: number
  scale: number
  seed: number
  phase?: number
  turn?: number
  arc?: number
}

export interface SkyState {
  entities: SkyEntity[]
  cloudTimer: number
  gullTimer: number
  flockTimer: number
}

const WIND_X = -6
const WIND_Y = 3
const MAX_CLOUDS = 3
const MAX_GULLS = 5
const CLOUD_MIN_ALT = 26
const CLOUD_MAX_ALT = 40
const GULL_MIN_ALT = 14
const GULL_MAX_ALT = 22
const FLOCK_MIN_ALT = 18
const FLOCK_MAX_ALT = 30
const CULL_MARGIN = 96
const GULL_FRAME_W = 26
const GULL_FRAME_H = 13
const GULL_SCALE = 0.72

function artCanvas(
  w: number,
  h: number
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  return [c, ctx]
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function countKind(sky: SkyState, kind: SkyKind): number {
  return sky.entities.reduce((n, entity) => n + (entity.kind === kind ? 1 : 0), 0)
}

function timer(min: number, max: number): number {
  return rand(min, max)
}

function cloudParallax(alt: number): number {
  const t = clamp01((alt - CLOUD_MIN_ALT) / (CLOUD_MAX_ALT - CLOUD_MIN_ALT))
  return 0.16 - t * 0.06
}

function gullParallax(alt: number): number {
  const t = clamp01((alt - GULL_MIN_ALT) / (FLOCK_MAX_ALT - GULL_MIN_ALT))
  return 0.56 - t * 0.2
}

function driftFor(entity: SkyEntity, speed: number): { x: number; y: number } {
  const parallax =
    entity.kind === "cloud" ? cloudParallax(entity.alt) : gullParallax(entity.alt)
  return {
    x: -SEA_VX * speed * parallax + WIND_X + entity.vx,
    y: SEA_VY * speed * parallax + WIND_Y + entity.vy,
  }
}

function gullArc(entity: SkyEntity, time: number): { x: number; y: number } {
  const phase = entity.phase ?? entity.seed
  const turn = entity.turn ?? 0.82
  const arc = entity.arc ?? 1
  return {
    x: Math.sin(time * turn * 0.64 + phase) * arc * 0.4,
    y: Math.cos(time * turn * 0.52 + phase * 0.7) * arc * 0.65,
  }
}

function spawnCloud(s: SceneState) {
  if (countKind(s.sky, "cloud") >= MAX_CLOUDS) return
  const alt = rand(CLOUD_MIN_ALT, CLOUD_MAX_ALT)
  s.sky.entities.push({
    kind: "cloud",
    x: s.bufW + rand(28, 92),
    y: rand(-36, s.bufH * 0.35),
    alt,
    vx: rand(-1.2, 1.2),
    vy: rand(-0.8, 0.8),
    flap: 0,
    scale: rand(0.85, 1.2),
    seed: Math.floor(rand(0, 1000)),
  })
}

function spawnGull(s: SceneState, flock = false, offsetX = 0, offsetY = 0) {
  if (countKind(s.sky, "gull") >= MAX_GULLS) return
  const alt = flock ? rand(FLOCK_MIN_ALT, FLOCK_MAX_ALT) : rand(GULL_MIN_ALT, GULL_MAX_ALT)
  const startRight = Math.random() < 0.65
  s.sky.entities.push({
    kind: "gull",
    x: startRight ? s.bufW + rand(12, 54) + offsetX : rand(20, s.bufW * 0.7) + offsetX,
    y: startRight ? rand(-16, s.bufH * 0.35) + offsetY : -rand(12, 42) + offsetY,
    alt,
    vx: rand(-14, -7) + (flock ? rand(-3, 3) : 0),
    vy: rand(3, 12) + (flock ? rand(-2, 4) : 0),
    flap: flock ? rand(1.6, 2.2) : rand(1.8, 2.6),
    scale: GULL_SCALE, // uniform — every gull renders the same small size
    seed: Math.floor(rand(0, 1000)),
    phase: rand(0, Math.PI * 2),
    turn: rand(0.68, 1.04),
    arc: flock ? rand(0.55, 1.1) : rand(0.9, 1.6),
  })
}

function spawnFlock(s: SceneState) {
  const n = Math.floor(rand(3, 6))
  for (let i = 0; i < n; i++) {
    spawnGull(s, true, rand(-14, 18), rand(-8, 10))
  }
}

export function makeCloudShadows(): HTMLCanvasElement[] {
  // Blobs are positioned within the canvas; soft gradient fill avoids the
  // hard blocky edges that made shadows read as stains on the water.
  const specs = [
    { w: 52, h: 26, blobs: [[17, 13, 14, 7], [31, 12, 17, 8], [40, 14, 11, 6]] },
    { w: 66, h: 30, blobs: [[18, 15, 16, 8], [36, 13, 20, 9], [52, 16, 13, 7]] },
    { w: 58, h: 28, blobs: [[15, 14, 12, 7], [30, 13, 20, 9], [46, 12, 12, 6]] },
    { w: 74, h: 32, blobs: [[18, 16, 16, 8], [40, 14, 22, 10], [60, 17, 14, 7]] },
  ]
  return specs.map((spec) => {
    const [c, ctx] = artCanvas(spec.w, spec.h)
    for (const [x, y, rx, ry] of spec.blobs) {
      // Radial gradient: opaque centre → transparent edge for a soft shadow.
      const r = Math.max(rx, ry) * 1.3
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r)
      grd.addColorStop(0, "rgba(10,18,38,0.32)")
      grd.addColorStop(0.55, "rgba(10,18,38,0.14)")
      grd.addColorStop(1, "rgba(10,18,38,0)")
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.ellipse(x, y, rx * 1.3, ry * 1.3, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    return c
  })
}

/** 4-frame flap cycle, ordered by wing height: 0 = wings down .. 3 = wings up. */
function gullFrame(entity: SkyEntity, time: number): number {
  const phase = entity.phase ?? entity.seed
  const wing = Math.sin(time * entity.flap + phase) // −1 (down) .. 1 (up)
  return Math.min(3, Math.max(0, Math.floor((wing * 0.5 + 0.5) * 4)))
}

/**
 * Hand-authored top-down seagull seen from above, head/beak toward the
 * bottom-left — the direction every gull drifts (down-left across the iso
 * ocean), so no runtime flip is needed. Wings sweep out to black-tipped
 * corners; a white tail fan fills the centre between the wing roots; a tiny
 * orange beak pokes off the head. Matches the rest of the scene's pixel
 * density. Four frames are a subtle flap, ordered by wing height: the tips
 * raise from row 5 (DOWN) up to row 2 (UP) — gullFrame() maps a sine wave to
 * this 0..3 order so the wings bob gently. 26×13.
 *   k black wingtip + outline   d dark grey   m mid grey   w light body/tail   o beak
 */
export function makeGullFrames(): HTMLCanvasElement[] {
  const DOWN = [
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "............ww............",
    ".kkd.......wwww.......dkk.",
    ".kkddmmm...wwww...mmmddkk.",
    "....dmmmmwwwwwwwwmmmmd....",
    "........mwwwwwwwwm........",
    "...........www............",
    "..........oww.............",
    "..........o...............",
    "..........................",
  ]
  const MID = [
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    ".kk.........ww.........kk.",
    ".kkddm.....wwww.....mddkk.",
    "...ddmmmm..wwww..mmmmdd...",
    "......mmmwwwwwwwwmmm......",
    ".........wwwwwwww.........",
    "...........www............",
    "..........oww.............",
    "..........o...............",
    "..........................",
  ]
  const LEVEL = [
    "..........................",
    "..........................",
    "..........................",
    ".kk....................kk.",
    ".kkdd.......ww.......ddkk.",
    "...ddmm....wwww....mmdd...",
    ".....mmmm..wwww..mmmm.....",
    ".......mmwwwwwwwwmm.......",
    ".........wwwwwwww.........",
    "...........www............",
    "..........oww.............",
    "..........o...............",
    "..........................",
  ]
  const UP = [
    "..........................",
    "..........................",
    ".k......................k.",
    ".kkd..................dkk.",
    "..kddm......ww......mddk..",
    "....dmmm...wwww...mmmd....",
    "......mmmw.wwww.wmmm......",
    "........mwwwwwwwwm........",
    "..........wwwwww..........",
    "...........www............",
    "..........oww.............",
    "..........o...............",
    "..........................",
  ]
  const palette: Record<string, string> = {
    k: "#23232f",
    d: "#454b5b",
    m: "#9aa3b2",
    w: "#e9edf3",
    o: "#e8a33d",
  }
  return [DOWN, MID, LEVEL, UP].map((rows) => {
    const [c, ctx] = artCanvas(GULL_FRAME_W, GULL_FRAME_H)
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const color = palette[rows[y][x]]
        if (!color) continue
        ctx.fillStyle = color
        ctx.fillRect(x, y, 1, 1)
      }
    }
    return c
  })
}

export function makeBirdShadow(): HTMLCanvasElement {
  const [c, ctx] = artCanvas(14, 3)
  ctx.fillStyle = "rgba(8,15,30,0.30)"
  ctx.fillRect(2, 1, 10, 1)
  ctx.fillStyle = "rgba(8,15,30,0.16)"
  ctx.fillRect(1, 1, 1, 1)
  ctx.fillRect(12, 1, 1, 1)
  ctx.fillStyle = "rgba(8,15,30,0.08)"
  ctx.fillRect(0, 1, 1, 1)
  ctx.fillRect(13, 1, 1, 1)
  return c
}

export function createSky(): SkyState {
  return {
    entities: [
      {
        kind: "cloud",
        x: 84,
        y: 58,
        alt: 34,
        vx: 0,
        vy: 0,
        flap: 0,
        scale: 1,
        seed: 1,
      },
      {
        kind: "gull",
        x: 156,
        y: 100,
        alt: 17,
        vx: -10,
        vy: 5,
        flap: 2.0,
        scale: GULL_SCALE,
        seed: 2,
        phase: 0.4,
        turn: 0.78,
        arc: 1.1,
      },
    ],
    cloudTimer: 7,
    gullTimer: 5,
    flockTimer: 48,
  }
}

export function updateSky(s: SceneState, dt: number) {
  if (s.mode === "inspect" || s.bufW === 0 || s.bufH === 0) return

  s.sky.cloudTimer -= dt
  s.sky.gullTimer -= dt
  s.sky.flockTimer -= dt

  if (s.sky.cloudTimer <= 0) {
    spawnCloud(s)
    s.sky.cloudTimer = timer(8, 14)
  }
  if (s.sky.gullTimer <= 0) {
    spawnGull(s)
    s.sky.gullTimer = timer(6, 10)
  }
  if (s.sky.flockTimer <= 0) {
    spawnFlock(s)
    s.sky.flockTimer = timer(40, 70)
  }

  for (let i = s.sky.entities.length - 1; i >= 0; i--) {
    const entity = s.sky.entities[i]
    const drift = driftFor(entity, s.speed)
    if (entity.kind === "gull") {
      const arc = gullArc(entity, s.t)
      entity.x += (drift.x + arc.x) * dt
      entity.y += (drift.y + arc.y) * dt
    } else {
      entity.x += drift.x * dt
      entity.y += drift.y * dt
    }
    if (
      entity.x < -CULL_MARGIN ||
      entity.y - entity.alt > s.bufH + CULL_MARGIN ||
      entity.y < -CULL_MARGIN * 2 ||
      entity.x > s.bufW + CULL_MARGIN * 2
    ) {
      s.sky.entities.splice(i, 1)
    }
  }
}

export function drawSkyShadows(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites
) {
  for (const entity of s.sky.entities) {
    if (entity.kind === "cloud") {
      const t = clamp01((entity.alt - CLOUD_MIN_ALT) / (CLOUD_MAX_ALT - CLOUD_MIN_ALT))
      const sprite = sprites.cloudShadows[entity.seed % sprites.cloudShadows.length]
      const scale = entity.scale * (1.1 + t * 0.7)
      const w = sprite.width * scale
      const h = sprite.height * scale
      // Low alpha + smoothing enabled so the soft gradient upscales cleanly.
      ctx.imageSmoothingEnabled = true
      ctx.globalAlpha = 0.24 - t * 0.08
      ctx.drawImage(sprite, Math.floor(entity.x - w / 2), Math.floor(entity.y - h / 2), w, h)
      ctx.globalAlpha = 1
      ctx.imageSmoothingEnabled = false
      continue
    }
    const t = clamp01((entity.alt - GULL_MIN_ALT) / (FLOCK_MAX_ALT - GULL_MIN_ALT))
    const scale = entity.scale * (0.75 + t * 0.55)
    const w = sprites.birdShadow.width * scale
    const h = sprites.birdShadow.height * scale
    ctx.globalAlpha = 0.46 - t * 0.22
    ctx.drawImage(
      sprites.birdShadow,
      Math.floor(entity.x - w / 2),
      Math.floor(entity.y - h / 2),
      w,
      h
    )
    ctx.globalAlpha = 1
  }
}

export function drawSkyTops(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites
) {
  for (const entity of s.sky.entities) {
    if (entity.kind !== "gull") continue
    const frame = gullFrame(entity, s.t) % sprites.gulls.length
    const sprite = sprites.gulls[frame]
    // Uniform sprite size: altitude still drives parallax + shadow, but every
    // gull is drawn the same small scale (no big/small variation).
    const scale = entity.scale
    const w = sprite.width * scale
    const h = sprite.height * scale
    ctx.drawImage(
      sprite,
      Math.floor(entity.x - w / 2),
      Math.floor(entity.y - entity.alt - h / 2),
      w,
      h
    )
  }
}
