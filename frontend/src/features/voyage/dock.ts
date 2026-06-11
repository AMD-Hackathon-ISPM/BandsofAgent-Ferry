// The loading dock (run pending/queued) and the destination "PR harbor".
// Static structures are baked once; only the crane load, stern door and sign
// text are drawn procedurally per frame — a handful of fillRects.

import type { SceneState } from "./scene"
import { horizonY } from "./sea"
import { FERRY_STERN, bakeSprite, makeArtCanvas, rect, line } from "./sprites"
import { shipBlitPos } from "./scene"
import { drawPixelText, pixelTextWidth } from "./cutaway/pixel-font"
import type { SpriteDef } from "./sprites"

const PIER = {
  deckTop: "#6d4d35",
  deckLight: "#a16c43",
  deckEdge: "#d0b98c",
  deckShade: "#2a2118",
  piling: "#4c382b",
  pilingCap: "#9b6a42",
  pilingWet: "#1b2747",
}

const WAREHOUSE = {
  wall: "#263a68",
  roof: "#4f6bff",
  trim: "#8fa3cf",
  dark: "#15223f",
  glow: "#f2c14e",
}

const CONTAINER_COLORS = ["#4f6bff", "#f2c14e", "#58bfd5", "#6ee7a8", "#d08a9e"]

const CRANE = {
  frame: "#c49a4b",
  frameDark: "#8a6a45",
  cab: "#2c3d6b",
  cable: "#8fa3cf",
  hook: "#dfe9fb",
}

/** Pier canvas layout: structures above the deck, pilings below it. */
const DOCK_W = 280
const DOCK_H = 96
const DECK_Y = 52
/** Pier overlap past the ship's stern while berthed. */
const DOCK_OVERLAP = 26
/** Pier deck height above the waterline, art px. */
const DECK_ABOVE_WATER = 12

// Distant destination skyline: lighthouse, cranes, warehouses; warm windows.
const DESTINATION: SpriteDef = {
  palette: {
    S: "#233158",
    s: "#2c3d6b",
    Q: "#1b2747",
    W: "#f2c14e",
    B: "#ffd166",
    i: "#4f6bff",
  },
  rows: [
    "....B.......................................",
    "...sss......................................",
    "...sWs........................s.............",
    "...sss........................s.............",
    "....S.........ssssssss........s.............",
    "....S................s......sssss...........",
    "...SSS...............s......ssiss....ssssss.",
    "...SSS...............s......sssss....s.W..s.",
    "...SSS.....SS........s.....sssssss...s....s.",
    "..SSSSS....SS....ssssssss..sssssss...sW...s.",
    "..SSSSS....SS....s..s......sSWSsss...s..W.s.",
    ".SSSSSSS...SS....s..s......sssssss...ssssss.",
    ".SSSSSSS...SSSSSSSSSSS..SSSSSSSSSS..SSSSSSS.",
    ".SSWSSSS...SSSSSSSSSSS..SW.SSW.SSS..SS.W.SS.",
    "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
    "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  ],
}

export interface DockSprites {
  pier: HTMLCanvasElement
  crane: HTMLCanvasElement
  destination: HTMLCanvasElement
}

function drawContainer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
) {
  rect(ctx, x, y, 16, 9, color)
  rect(ctx, x, y, 16, 1, "#f4f7fd")
  rect(ctx, x, y + 8, 16, 1, "#0e1730")
  for (let i = 2; i < 16; i += 3) rect(ctx, x + i, y + 1, 1, 7, "#0e1730")
}

function bakePier(): HTMLCanvasElement {
  const [c, ctx] = makeArtCanvas(DOCK_W, DOCK_H)

  // Deck slab with plank seams, edge highlight and shaded underside.
  rect(ctx, 0, DECK_Y, DOCK_W, 10, PIER.deckTop)
  rect(ctx, 0, DECK_Y, DOCK_W, 1, PIER.deckEdge)
  rect(ctx, 0, DECK_Y + 10, DOCK_W, 3, PIER.deckShade)
  for (let x = 9; x < DOCK_W; x += 14) {
    line(ctx, x, DECK_Y + 1, x, DECK_Y + 9, PIER.deckLight)
  }
  // Pilings into the water.
  for (let x = 6; x < DOCK_W - 4; x += 26) {
    rect(ctx, x, DECK_Y + 13, 5, 18, PIER.piling)
    rect(ctx, x - 1, DECK_Y + 11, 7, 2, PIER.pilingCap)
    rect(ctx, x, DECK_Y + 31, 5, 3, PIER.pilingWet)
  }
  // Bollards along the edge.
  for (const x of [30, 110, 196, 256]) {
    rect(ctx, x, DECK_Y - 4, 4, 4, PIER.pilingCap)
    rect(ctx, x + 1, DECK_Y - 5, 2, 1, PIER.deckEdge)
  }

  // Warehouse, set back on the pier.
  const wx = 8
  const wy = DECK_Y - 38
  rect(ctx, wx - 1, wy + 38 - 2, 78, 2, WAREHOUSE.dark)
  rect(ctx, wx, wy, 76, 36, WAREHOUSE.wall)
  rect(ctx, wx, wy + 35, 76, 1, WAREHOUSE.dark)
  for (let i = 0; i < 7; i++) {
    rect(ctx, wx - 3 + i, wy - i, 82 - i * 2, 1, WAREHOUSE.roof)
  }
  rect(ctx, wx - 2, wy - 1, 80, 1, WAREHOUSE.trim)
  // Big sliding door, warm interior glow.
  rect(ctx, wx + 28, wy + 12, 22, 24, WAREHOUSE.dark)
  rect(ctx, wx + 30, wy + 14, 18, 22, WAREHOUSE.glow)
  for (let i = 0; i < 4; i++) {
    rect(ctx, wx + 30 + i * 5, wy + 14, 1, 22, WAREHOUSE.dark)
  }
  // Windows.
  for (const ox of [6, 58]) {
    rect(ctx, wx + ox, wy + 8, 8, 6, WAREHOUSE.glow)
    rect(ctx, wx + ox, wy + 8, 8, 1, "#f4f7fd")
  }

  // Container stacks waiting on the pier.
  drawContainer(ctx, 100, DECK_Y - 9, CONTAINER_COLORS[0])
  drawContainer(ctx, 118, DECK_Y - 9, CONTAINER_COLORS[2])
  drawContainer(ctx, 109, DECK_Y - 18, CONTAINER_COLORS[1])
  drawContainer(ctx, 140, DECK_Y - 9, CONTAINER_COLORS[3])
  drawContainer(ctx, 158, DECK_Y - 9, CONTAINER_COLORS[4])
  drawContainer(ctx, 149, DECK_Y - 18, CONTAINER_COLORS[0])
  drawContainer(ctx, 149, DECK_Y - 27, CONTAINER_COLORS[2])

  // Departure-board post; the live text is drawn over it each frame.
  rect(ctx, 222, DECK_Y - 26, 3, 26, PIER.piling)
  rect(ctx, 204, DECK_Y - 40, 40, 16, "#111a33")
  rect(ctx, 205, DECK_Y - 39, 38, 14, "#1b2747")
  rect(ctx, 204, DECK_Y - 40, 40, 1, WAREHOUSE.trim)

  return c
}

function bakeCrane(): HTMLCanvasElement {
  const [c, ctx] = makeArtCanvas(150, 96)
  // Lattice tower at the left; jib reaches right, over the ship's aft deck.
  const tx = 8
  rect(ctx, tx, 18, 6, 70, CRANE.frame)
  for (let y = 22; y < 86; y += 8) {
    line(ctx, tx, y, tx + 5, y + 6, CRANE.frameDark)
    line(ctx, tx + 5, y, tx, y + 6, CRANE.frameDark)
  }
  rect(ctx, tx - 4, 86, 14, 4, CRANE.frameDark)
  // Counter-jib + jib.
  rect(ctx, 0, 14, 146, 4, CRANE.frame)
  rect(ctx, 0, 14, 146, 1, "#ead39a")
  for (let x = 4; x < 142; x += 10) {
    line(ctx, x, 18, x + 6, 14, CRANE.frameDark)
  }
  // Counterweight + operator cab.
  rect(ctx, 0, 18, 8, 8, CRANE.frameDark)
  rect(ctx, tx + 7, 18, 10, 9, CRANE.cab)
  rect(ctx, tx + 8, 19, 8, 4, "#65d6ff")
  // Apex tie.
  line(ctx, tx + 3, 2, tx + 3, 14, CRANE.frame)
  line(ctx, tx + 3, 2, 80, 13, CRANE.cable)
  line(ctx, tx + 3, 2, 2, 13, CRANE.cable)
  return c
}

export function bakeDockSprites(): DockSprites {
  return {
    pier: bakePier(),
    crane: bakeCrane(),
    destination: bakeSprite(DESTINATION),
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Pier origin (top-left of the baked pier canvas) in art px. */
function pierOrigin(s: SceneState): { x: number; y: number } {
  const pos = shipBlitPos(s)
  const sternX = pos.x + FERRY_STERN.x
  const waterY = pos.y + FERRY_STERN.y
  return {
    x: Math.floor(sternX + DOCK_OVERLAP - DOCK_W + s.dockX),
    y: Math.floor(waterY - DECK_ABOVE_WATER - DECK_Y),
  }
}

/** Everything behind the ship: pier, warehouse, cargo, sign. */
export function drawDockBack(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  d: DockSprites
) {
  if (s.dockX <= -DOCK_W - 160) return
  const o = pierOrigin(s)
  ctx.drawImage(d.pier, o.x, o.y)

  // Departure board text.
  const queued = s.voyage.mode === "pending"
  const label = queued ? "IN QUEUE" : "DEPARTING"
  const lx = o.x + 224 - Math.floor(pixelTextWidth(label) / 2)
  drawPixelText(ctx, label, lx, o.y + DECK_Y - 36, "#f2c14e")
  const sub = "CARGO LOADING"
  drawPixelText(
    ctx,
    sub,
    o.x + 224 - Math.floor(pixelTextWidth(sub) / 2),
    o.y + DECK_Y - 29,
    "#8fa3cf"
  )
  // Blinking status lamp on the board.
  if (Math.floor(s.t * 1.6) % 2 === 0) {
    rect(ctx, o.x + 207, o.y + DECK_Y - 37, 2, 2, queued ? "#ffd166" : "#52d273")
  }
}

/**
 * Everything in front of the ship: the crane (its jib hangs the next
 * container over the aft deck), the gangway ramp and the stern door.
 */
export function drawDockFront(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  d: DockSprites
) {
  if (s.dockX <= -DOCK_W - 160) return
  const o = pierOrigin(s)
  const pos = shipBlitPos(s)
  const sternX = pos.x + FERRY_STERN.x
  const waterY = pos.y + FERRY_STERN.y

  // Stern loading door: a warm-lit opening above the waterline that seals
  // shut (bottom-up) as the ferry prepares to leave.
  const doorH = Math.round(13 * (1 - s.doorT))
  if (doorH > 0) {
    rect(ctx, sternX + 1, waterY - 15, 12, 15, "#0e1730")
    rect(ctx, sternX + 2, waterY - 14 + (13 - doorH), 10, doorH, "#f2c14e")
    if (doorH > 4) {
      rect(ctx, sternX + 2, waterY - 14 + (13 - doorH), 10, 1, "#f4f7fd")
    }
  }

  // Gangway ramp pier→stern; it retracts as the door closes.
  const ramp = 1 - clamp01(s.doorT * 1.6)
  if (ramp > 0.05) {
    const px = o.x + DOCK_W - 4
    const py = o.y + DECK_Y
    const rx = Math.floor(sternX + 2 + (px - sternX - 2) * (1 - ramp))
    line(ctx, px, py, rx, waterY - 2, PIER.deckEdge)
    line(ctx, px, py + 1, rx, waterY - 1, PIER.deckTop)
  }

  // Crane behind-left of the stern, jib over the aft deck.
  const cx = o.x + DOCK_W - 116
  const cy = o.y + DECK_Y - 88
  ctx.drawImage(d.crane, cx, cy)

  // Hoist cycle: pick a container pier-side, carry it out over the deck,
  // lower, release, return. Runs only while cargo is still being loaded.
  if (s.stage === "dock" || (s.stage === "depart" && s.stageT < 0.6)) {
    const p = (s.craneT % 7) / 7
    const jibY = cy + 18
    const homeX = cx + 34
    const outX = cx + 132
    let trolleyX: number
    let drop: number
    let carrying: boolean
    if (p < 0.28) {
      trolleyX = homeX + (outX - homeX) * easeInOutCubic(p / 0.28)
      drop = 10
      carrying = true
    } else if (p < 0.5) {
      trolleyX = outX
      drop = 10 + 38 * easeInOutCubic((p - 0.28) / 0.22)
      carrying = true
    } else if (p < 0.62) {
      trolleyX = outX
      drop = 48 - 38 * easeInOutCubic((p - 0.5) / 0.12)
      carrying = false
    } else if (p < 0.88) {
      trolleyX = outX + (homeX - outX) * easeInOutCubic((p - 0.62) / 0.26)
      drop = 10
      carrying = false
    } else {
      trolleyX = homeX
      drop = 10 + 26 * Math.sin((Math.PI * (p - 0.88)) / 0.12)
      carrying = p > 0.94
    }
    const tx = Math.floor(trolleyX)
    rect(ctx, tx - 3, jibY, 6, 3, CRANE.frameDark)
    line(ctx, tx, jibY + 3, tx, jibY + 3 + Math.floor(drop), CRANE.cable)
    const hy2 = jibY + 3 + Math.floor(drop)
    rect(ctx, tx - 2, hy2, 4, 2, CRANE.hook)
    if (carrying) {
      drawContainer(
        ctx,
        tx - 8,
        hy2 + 2,
        CONTAINER_COLORS[Math.floor(s.craneT / 7) % CONTAINER_COLORS.length]
      )
    }
  }
}

/** The destination harbor sliding in from the horizon as the run wraps up. */
export function drawDestination(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  d: DockSprites
) {
  const a = s.arrival
  if (a < 0.02) return
  const hy = horizonY(s.bufH)
  const e = easeInOutCubic(a)
  const scale = 1 + 2 * e
  const w = Math.floor(d.destination.width * scale)
  const h = Math.floor(d.destination.height * scale)
  const cx = Math.floor(s.bufW * (0.88 - 0.1 * e))
  const yBottom = Math.floor(hy + 4 + (s.bufH * 0.52 - hy - 4) * e)
  ctx.globalAlpha = Math.min(1, a * 4)
  ctx.drawImage(d.destination, cx - Math.floor(w / 2), yBottom - h, w, h)

  // Lighthouse beacon: warm while approaching, PR-green once the pull
  // request is open.
  const ready = s.voyage.prReady
  const pulse = 0.55 + Math.sin(s.t * 3) * 0.45
  ctx.globalAlpha = Math.min(1, a * 4) * Math.max(0.2, pulse)
  const bx = cx - Math.floor(w / 2) + Math.floor(4.5 * scale)
  const by = yBottom - h
  rect(ctx, bx - 1, by, Math.max(2, Math.floor(scale)), Math.max(2, Math.floor(scale)), ready ? "#52d273" : "#ffd166")
  ctx.globalAlpha = 1
}
