// The destination "PR harbor" the ferry moors at when a run completes. (The
// departure loading dock is now the full iso harbor in harbor.ts.) The distant
// skyline is baked once; only the lighthouse beacon is drawn per frame.

import type { SceneState } from "./scene"
import { horizonY } from "./sea"
import { bakeSprite, rect } from "./sprites"
import type { SpriteDef } from "./sprites"

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
  destination: HTMLCanvasElement
}

export function bakeDockSprites(): DockSprites {
  return {
    destination: bakeSprite(DESTINATION),
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
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
