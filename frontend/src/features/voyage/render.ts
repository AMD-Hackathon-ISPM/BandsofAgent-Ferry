// Paints one frame of the voyage scene into the low-res art buffer.
// Every blit position goes through Math.floor — sub-pixel positions would
// destroy the pixel-art crispness.
//
// The whole frame is ocean (no sky/horizon): the departure harbor occupies
// the bottom-left while loading, the destination harbor slides in at the
// top-right on arrival, and the small at-sea ferry holds the center between.

import { drawSea } from "./sea"
import { drawSkyShadows, drawSkyTops } from "./sky"
import {
  shipBlitPos,
  shipBobOffset,
  type SceneState,
} from "./scene"
import { type Sprites } from "./sprites"
import { drawInspect } from "./inspect"
import {
  drawDestinationBack,
  drawHarborBack,
  drawHarborFront,
  harborFerryPos,
  DEPART_SITE,
  DEST_SITE,
  type HarborScene,
} from "./harbor"
import type { FerryBakeAt } from "./voxel/bake"

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites,
  harbor: HarborScene,
  harborFerry: FerryBakeAt
) {
  if (s.bufW <= 0 || s.bufH <= 0) return
  // The sea keeps living behind the inspection view, just dimmed — only the
  // ship itself is lifted out and drawn live by the voxel renderer on top.
  drawSeaScene(ctx, s, sprites, harbor, harborFerry)
  if (s.mode === "inspect") drawInspect(ctx, s, sprites)
}

function drawSeaScene(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites,
  harbor: HarborScene,
  harborFerry: FerryBakeAt
) {
  drawSea(ctx, s, sprites)
  if (s.mode === "sea") drawSkyShadows(ctx, s, sprites)

  // Loading harbor (bottom-left): big berthed ferry between its back/front
  // prop layers; the ship slides off up-right on departure, then the props
  // fade out (departFade) into open sea.
  const atDock = s.stage === "dock" || s.stage === "depart"
  const harborAlpha = 1 - s.departFade
  if (atDock && harborAlpha > 0.01) {
    drawHarborBack(ctx, s, harbor, harborAlpha)
    const hp = harborFerryPos(s, DEPART_SITE)
    ctx.globalAlpha = harborAlpha
    ctx.drawImage(harborFerry.shadow, hp.x, hp.y + 1)
    ctx.drawImage(harborFerry.frames[0], hp.x, hp.y)
    ctx.globalAlpha = 1
    drawHarborFront(ctx, s, harbor, harborAlpha)
  }

  // Destination island terminal (top side): fades in at the start of the
  // arrive stage, then the big ferry slides in from the bottom-left and
  // moors alongside the pad. Everything on the island sits on the ship's
  // far side, so no over-ship layer is needed.
  const atDest = s.stage === "arrive" || s.stage === "docked"
  if (atDest && s.arriveFade > 0.01) {
    drawDestinationBack(ctx, s, harbor, s.arriveFade)
    const dp = harborFerryPos(s, DEST_SITE)
    ctx.globalAlpha = s.arriveFade
    ctx.drawImage(harborFerry.shadow, dp.x, dp.y + 1)
    ctx.drawImage(harborFerry.frames[0], dp.x, dp.y)
    ctx.globalAlpha = 1
  }

  // Wake foam, oldest faintest.
  for (const p of s.wake) {
    const f = Math.min(2, Math.floor((p.age / p.life) * 3))
    ctx.drawImage(sprites.foam[f], Math.floor(p.x), Math.floor(p.y))
  }

  // The small at-sea ferry: holds the center at open water (entering from
  // the bottom-left after departure), fades away as the destination scene
  // takes over.
  const seaAlpha =
    s.stage === "sea"
      ? s.seaEnter > 0
        ? 1
        : 0
      : s.stage === "arrive"
        ? 1 - s.arriveFade
        : 0
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
  if (s.mode === "sea") drawSkyTops(ctx, s, sprites)
}
