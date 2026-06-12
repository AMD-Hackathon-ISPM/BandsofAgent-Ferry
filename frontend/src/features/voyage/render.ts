// Paints one frame of the voyage scene into the low-res art buffer.
// Every blit position goes through Math.floor — sub-pixel positions would
// destroy the pixel-art crispness.

import { drawSea, hash2, horizonY } from "./sea"
import { shipBlitPos, shipBobOffset, type SceneState } from "./scene"
import { COLORS, type Sprites } from "./sprites"
import { drawInspect } from "./inspect"
import { drawDestination, type DockSprites } from "./dock"
import {
  drawHarborBack,
  drawHarborFront,
  harborFerryPos,
  type HarborScene,
} from "./harbor"
import type { FerryBakeAt } from "./voxel/bake"

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites,
  dock: DockSprites,
  harbor: HarborScene,
  harborFerry: FerryBakeAt
) {
  if (s.bufW <= 0 || s.bufH <= 0) return
  // The sea keeps living behind the inspection view, just dimmed — only the
  // ship itself is lifted out and drawn live by the voxel renderer on top.
  drawSeaScene(ctx, s, sprites, dock, harbor, harborFerry)
  if (s.mode === "inspect") drawInspect(ctx, s, sprites)
}

function drawSeaScene(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites,
  dock: DockSprites,
  harbor: HarborScene,
  harborFerry: FerryBakeAt
) {
  const hy = horizonY(s.bufH)

  // Sky, stars, moon.
  ctx.fillStyle = COLORS.sky
  ctx.fillRect(0, 0, s.bufW, hy + 1)
  drawStars(ctx, s.bufW, hy)
  ctx.drawImage(sprites.moon, Math.floor(s.bufW * 0.12), 6)

  drawSea(ctx, s, sprites)

  // Dithered atmosphere band instead of a hard horizon line.
  const haze = sprites.horizonHaze
  for (let x = 0; x < s.bufW; x += haze.width) {
    ctx.drawImage(haze, x, hy - 2)
  }

  drawDestination(ctx, s, dock)

  // Loading harbor: the big berthed ferry between its back/front prop layers,
  // cross-fading out (departFade) into the open-sea ferry on departure.
  const atDock = s.stage === "dock" || s.stage === "depart"
  const harborAlpha = 1 - s.departFade
  if (atDock && harborAlpha > 0.01) {
    drawHarborBack(ctx, s, harbor, harborAlpha)
    const hp = harborFerryPos(s)
    ctx.globalAlpha = harborAlpha
    ctx.drawImage(harborFerry.shadow, hp.x, hp.y + 1)
    ctx.drawImage(harborFerry.frames[0], hp.x, hp.y)
    ctx.globalAlpha = 1
    drawHarborFront(ctx, s, harbor, harborAlpha)
  }

  // Wake foam, oldest faintest.
  for (const p of s.wake) {
    const f = Math.min(2, Math.floor((p.age / p.life) * 3))
    ctx.drawImage(sprites.foam[f], Math.floor(p.x), Math.floor(p.y))
  }

  // Contact shadow stays on the waterline; the hull bobs off it. The at-sea
  // ferry is hidden while fully docked and fades in across the depart cut.
  const seaAlpha =
    s.stage === "dock" ? 0 : s.stage === "depart" ? s.departFade : 1
  const pos = shipBlitPos(s)
  if (s.mode === "sea" && seaAlpha > 0.01) {
    ctx.globalAlpha = seaAlpha
    ctx.drawImage(sprites.ferryShadow, pos.x, pos.y + 1)
    const bob = shipBobOffset(s)
    const frame = Math.floor(s.t * 4.4) % 4
    const ferry = sprites.ferry[frame]
    ctx.drawImage(ferry, pos.x, pos.y + bob)
    ctx.globalAlpha = 1
    s.shipRect = { x: pos.x, y: pos.y + bob, w: ferry.width, h: ferry.height }
  } else if (s.inspect) {
    // Ship is lifted out for inspection; its contact shadow fades away.
    const a = Math.max(0, 1 - s.inspect.dim * 2.5)
    if (a > 0) {
      ctx.globalAlpha = a
      ctx.drawImage(sprites.ferryShadow, pos.x, pos.y + 1)
      ctx.globalAlpha = 1
    }
  }

  // Sky dressing above everything in its band.
  for (const c of s.clouds) {
    ctx.drawImage(sprites.clouds[c.idx], Math.floor(c.x), Math.floor(c.y))
  }
  if (s.bird) {
    const by = s.bird.baseY + Math.sin(s.t * 2 + s.bird.phase) * 2
    // Up–level–down–level flap cycle over the three baked frames.
    const flap = [0, 1, 2, 1][Math.floor(s.t * 6) % 4]
    ctx.drawImage(
      sprites.birds[flap],
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
