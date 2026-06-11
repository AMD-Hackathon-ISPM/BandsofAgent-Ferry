// Paints one frame of the voyage scene into the low-res art buffer.
// Every blit position goes through Math.floor — sub-pixel positions would
// destroy the pixel-art crispness.

import { drawSea, hash2, horizonY } from "./sea"
import { shipBlitPos, shipBobOffset, type SceneState } from "./scene"
import { COLORS, type Sprites } from "./sprites"
import { drawInspect } from "./inspect"
import type { HarborState } from "./progress"

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites
) {
  if (s.bufW <= 0 || s.bufH <= 0) return
  // The sea keeps living behind the inspection view, just dimmed — only the
  // ship itself is lifted out and drawn live by the voxel renderer on top.
  drawSeaScene(ctx, s, sprites)
  if (s.mode === "inspect") drawInspect(ctx, s, sprites)
}

function drawSeaScene(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites
) {
  const hy = horizonY(s.bufH)

  // Sky, stars, moon, horizon.
  ctx.fillStyle = COLORS.sky
  ctx.fillRect(0, 0, s.bufW, hy + 1)
  drawStars(ctx, s.bufW, hy)
  ctx.drawImage(sprites.moon, Math.floor(s.bufW * 0.12), 6)
  ctx.fillStyle = COLORS.horizon
  ctx.fillRect(0, hy, s.bufW, 1)

  drawSea(ctx, s, sprites)

  drawAgentHarbors(ctx, s, sprites, hy)

  // Wake foam, oldest faintest.
  for (const p of s.wake) {
    const f = Math.min(2, Math.floor((p.age / p.life) * 3))
    ctx.drawImage(sprites.foam[f], Math.floor(p.x), Math.floor(p.y))
  }

  // Contact shadow stays on the waterline; the hull bobs off it.
  const pos = shipBlitPos(s)
  if (s.mode === "sea") {
    ctx.drawImage(sprites.ferryShadow, pos.x, pos.y + 1)
    const bob = shipBobOffset(s)
    const frame = Math.floor(s.t * 2.2) % 2
    const ferry = sprites.ferry[frame]
    ctx.drawImage(ferry, pos.x, pos.y + bob)
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
    ctx.drawImage(
      sprites.birds[Math.floor(s.t * 4) % 2],
      Math.floor(s.bird.x),
      Math.floor(by)
    )
  }
}

function drawAgentHarbors(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  sprites: Sprites,
  hy: number
) {
  const count = sprites.harbors.length
  const route = s.progress * Math.max(1, count - 1)
  const baseX = s.bufW * 0.56
  const baseY = Math.max(hy + 24, s.bufH * 0.36)
  const stepX = Math.max(62, Math.min(108, s.bufW * 0.18))
  const stepY = Math.max(30, Math.min(56, s.bufH * 0.09))
  const placed: Array<{
    index: number
    x: number
    y: number
    w: number
    h: number
    state: HarborState
    alpha: number
  }> = []

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, s.bufW, s.bufH - 12)
  ctx.clip()

  for (let i = 0; i < count; i++) {
    const rel = i - route
    if (rel < -2.3 || rel > 3.2) continue

    const hb = sprites.harbors[i]
    const distance = Math.abs(rel)
    const state = s.voyage.harborStates[i] ?? "upcoming"
    const scale = Math.max(
      0.68,
      Math.min(1.08, 1 - Math.max(0, rel) * 0.1 - Math.min(0, rel) * 0.03)
    )
    const w = Math.floor(hb.width * scale)
    const h = Math.floor(hb.height * scale)
    const x = Math.floor(baseX + rel * stepX - w / 2)
    const y = Math.floor(baseY - rel * stepY + distance * 2 - h / 2)
    const alpha =
      state === "upcoming"
        ? Math.max(0.24, 0.45 - distance * 0.04)
        : state === "skipped"
          ? 0.48
          : Math.max(0.56, 1 - distance * 0.14)

    placed.push({ index: i, x, y, w, h, state, alpha })
  }

  s.harborRects = placed.map((p) => ({
    index: p.index,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
  }))

  ctx.globalAlpha = 0.32
  for (let i = 0; i < placed.length - 1; i++) {
    const a = placed[i]
    const b = placed[i + 1]
    drawRouteSegment(ctx, a.x + a.w / 2, a.y + a.h - 5, b.x + b.w / 2, b.y + b.h - 5)
  }
  ctx.globalAlpha = 1

  for (const harbor of placed.sort((a, b) => a.y + a.h - (b.y + b.h))) {
    const hb = sprites.harbors[harbor.index]

    ctx.globalAlpha = harbor.alpha
    ctx.drawImage(hb, harbor.x, harbor.y, harbor.w, harbor.h)

    // Small reflection strokes connect each harbor to the water without
    // turning the scene into a foreground boardwalk.
    ctx.globalAlpha = harbor.alpha * 0.42
    const ry = harbor.y + harbor.h - 2
    ctx.fillStyle = harbor.state === "active" ? "#dfe9fb" : COLORS.horizon
    ctx.fillRect(harbor.x + Math.floor(harbor.w * 0.22), ry, Math.floor(harbor.w * 0.18), 1)
    ctx.fillRect(
      harbor.x + Math.floor(harbor.w * 0.56),
      ry + 3,
      Math.floor(harbor.w * 0.24),
      1
    )

    if (harbor.state === "active") {
      const pulse = 0.55 + Math.sin(s.t * 4) * 0.35
      ctx.globalAlpha = Math.max(0.25, pulse)
      ctx.fillStyle = "#ffd166"
      ctx.fillRect(harbor.x + harbor.w - 24, harbor.y + 15, 2, 2)
      ctx.fillRect(harbor.x + harbor.w - 25, harbor.y + 16, 4, 1)
      ctx.fillStyle = "#f4f7fd"
      ctx.fillRect(harbor.x + harbor.w - 23, harbor.y + 14, 1, 1)
    }
    drawHarborMarker(ctx, harbor)
  }

  ctx.restore()
  ctx.globalAlpha = 1
}

function drawRouteSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const steps = 7
  ctx.fillStyle = "#5d76a8"
  for (let i = 1; i < steps; i += 2) {
    const x = Math.floor(x1 + ((x2 - x1) * i) / steps)
    const y = Math.floor(y1 + ((y2 - y1) * i) / steps)
    ctx.fillRect(x, y, 5, 1)
  }
}

function drawHarborMarker(
  ctx: CanvasRenderingContext2D,
  harbor: {
    x: number
    y: number
    w: number
    state: HarborState
    alpha: number
  }
) {
  const cx = Math.floor(harbor.x + harbor.w / 2)
  const y = harbor.y - 10
  if (harbor.state === "upcoming") return

  ctx.globalAlpha = harbor.state === "skipped" ? 0.72 : 0.95
  ctx.fillStyle =
    harbor.state === "failed"
      ? "#ef4444"
      : harbor.state === "blocked"
        ? "#f59e0b"
        : harbor.state === "active"
          ? "#ffd166"
          : harbor.state === "skipped"
            ? "#8fa3cf"
            : "#52d273"
  ctx.fillRect(cx - 5, y, 10, 8)
  ctx.fillStyle = "#111a33"

  if (harbor.state === "done" || harbor.state === "active") {
    ctx.fillRect(cx - 3, y + 4, 2, 2)
    ctx.fillRect(cx - 1, y + 5, 2, 2)
    ctx.fillRect(cx + 1, y + 3, 2, 2)
    ctx.fillRect(cx + 3, y + 1, 2, 2)
  } else if (harbor.state === "failed") {
    ctx.fillRect(cx - 3, y + 2, 2, 2)
    ctx.fillRect(cx - 1, y + 4, 2, 2)
    ctx.fillRect(cx + 1, y + 2, 2, 2)
    ctx.fillRect(cx - 3, y + 6, 2, 1)
    ctx.fillRect(cx + 2, y + 6, 2, 1)
  } else if (harbor.state === "blocked") {
    ctx.fillRect(cx - 1, y + 1, 2, 4)
    ctx.fillRect(cx - 1, y + 6, 2, 1)
  } else {
    ctx.fillRect(cx - 3, y + 3, 6, 2)
  }
  ctx.globalAlpha = 1
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
