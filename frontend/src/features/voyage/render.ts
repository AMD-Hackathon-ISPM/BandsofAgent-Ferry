// Paints one frame of the voyage scene into the low-res art buffer.
// Every blit position goes through Math.floor — sub-pixel positions would
// destroy the pixel-art crispness.

import { drawSea, hash2, horizonY } from "./sea"
import { shipBlitPos, type SceneState } from "./scene"
import { COLORS, type Sprites } from "./sprites"

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites
) {
  if (s.bufW <= 0 || s.bufH <= 0) return
  if (s.mode !== "sea") return // "zooming" / "interior" arrive in a later pass

  const hy = horizonY(s.bufH)

  // Sky, stars, moon, horizon.
  ctx.fillStyle = COLORS.sky
  ctx.fillRect(0, 0, s.bufW, hy + 1)
  drawStars(ctx, s.bufW, hy)
  ctx.drawImage(sprites.moon, Math.floor(s.bufW * 0.12), 6)
  ctx.fillStyle = COLORS.horizon
  ctx.fillRect(0, hy, s.bufW, 1)

  drawSea(ctx, s, sprites)

  // Destination harbor slides in along the horizon late in the voyage,
  // settling right of the ship where the floating panels don't cover it.
  const appear = Math.min(1, Math.max(0, (s.progress - 0.72) / 0.28))
  if (appear > 0) {
    const hb = sprites.harbor
    const rest = Math.floor(s.bufW * 0.66 - hb.width / 2)
    const hx = Math.floor(s.bufW - appear * (s.bufW - rest))
    ctx.drawImage(hb, hx, hy - hb.height + 3)
  }

  // Wake foam, oldest faintest.
  for (const p of s.wake) {
    const f = Math.min(2, Math.floor((p.age / p.life) * 3))
    ctx.drawImage(sprites.foam[f], Math.floor(p.x), Math.floor(p.y))
  }

  // Contact shadow stays on the waterline; the hull bobs off it.
  const pos = shipBlitPos(s)
  ctx.drawImage(sprites.ferryShadow, pos.x, pos.y + 1)

  const bobRate = s.voyage.mode === "failed" ? 1.2 : 2.1
  const bob = Math.round(Math.sin(s.t * bobRate) * 1.4)
  const frame = Math.floor(s.t * 2.2) % 2
  const ferry = sprites.ferry[frame]
  ctx.drawImage(ferry, pos.x, pos.y + bob)
  s.shipRect = { x: pos.x, y: pos.y + bob, w: ferry.width, h: ferry.height }

  // Sky dressing above everything in its band.
  for (const c of s.clouds) {
    ctx.drawImage(sprites.clouds[c.idx], Math.floor(c.x), Math.floor(c.y))
  }
  if (s.bird) {
    const by = s.bird.baseY + Math.sin(s.t * 2 + s.bird.phase) * 2
    ctx.drawImage(
      sprites.birds[Math.floor(s.t * 4) % 2],
      Math.floor(s.bird.x),
      Math.floor(by)
    )
  }
}

function drawStars(ctx: CanvasRenderingContext2D, w: number, hy: number) {
  for (let cy = 0; cy < Math.ceil(hy / 8); cy++) {
    for (let cx = 0; cx < Math.ceil(w / 8); cx++) {
      const h = hash2(cx, cy, 3)
      if (h % 13 !== 0) continue
      const x = cx * 8 + ((h >>> 4) % 7)
      const y = cy * 8 + ((h >>> 8) % 7)
      if (y >= hy - 2) continue
      ctx.fillStyle = h % 89 === 0 ? COLORS.starBright : COLORS.star
      ctx.fillRect(x, y, 1, 1)
    }
  }
}
