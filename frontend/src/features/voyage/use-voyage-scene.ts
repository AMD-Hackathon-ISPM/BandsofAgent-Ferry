import * as React from "react"

import { usePrefersReducedMotion } from "@/lib/hooks"
import { bakeSprites } from "./sprites"
import { createScene, updateScene } from "./scene"
import { drawFrame } from "./render"
import { VOYAGE_STOP_COUNT, type VoyageStatus } from "./progress"

/** Art pixels are this many CSS px wide (snapped to the device-pixel grid). */
const PIXEL_SCALE = 3

/**
 * Owns the voyage canvas: sprite baking, DPR-snapped low-res buffer sizing,
 * the rAF loop, visibility pausing, and reduced-motion stills. Everything is
 * created and torn down inside a single effect, so StrictMode's
 * mount→cleanup→remount is safe by construction. Scene data lives in refs —
 * no React re-renders per frame.
 */
export function useVoyageScene(
  voyage: VoyageStatus,
  options: { onHarborClick?: (index: number) => void } = {}
): {
  wrapRef: React.RefObject<HTMLDivElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
} {
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()
  const voyageRef = React.useRef(voyage)
  const onHarborClickRef = React.useRef(options.onHarborClick)
  const stillFrameRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    onHarborClickRef.current = options.onHarborClick
  }, [options.onHarborClick])

  React.useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const sprites = bakeSprites()
    const scene = createScene()
    scene.voyage = voyageRef.current
    scene.onHarborClick = (index) => onHarborClickRef.current?.(index)
    // Start active runs one harbor behind so refreshes still show travel.
    scene.progress =
      voyageRef.current.mode === "sailing"
        ? Math.max(
            0,
            voyageRef.current.target - 1 / Math.max(1, VOYAGE_STOP_COUNT - 1)
          )
        : voyageRef.current.target

    let raf = 0
    let running = false
    let prev = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const snapped = Math.round(PIXEL_SCALE * dpr) / dpr
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (w === 0 || h === 0) {
        scene.bufW = 0
        scene.bufH = 0
        return
      }
      const bw = Math.ceil(w / snapped)
      const bh = Math.ceil(h / snapped)
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw
        canvas.height = bh
      }
      canvas.style.width = `${bw * snapped}px`
      canvas.style.height = `${bh * snapped}px`
      // Resizing the backing store resets context state.
      ctx.imageSmoothingEnabled = false
      scene.bufW = bw
      scene.bufH = bh
      drawFrame(ctx, scene, sprites)
    }

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((ts - (prev || ts)) / 1000, 0.1)
      prev = ts
      scene.voyage = voyageRef.current
      updateScene(scene, dt)
      drawFrame(ctx, scene, sprites)
    }
    const start = () => {
      if (running) return
      running = true
      prev = 0
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else if (!reduced) start()
    }

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || scene.bufW === 0) return
      const ax = ((e.clientX - rect.left) / rect.width) * scene.bufW
      const ay = ((e.clientY - rect.top) / rect.height) * scene.bufH
      for (let i = scene.harborRects.length - 1; i >= 0; i--) {
        const h = scene.harborRects[i]
        if (ax >= h.x && ax < h.x + h.w && ay >= h.y && ay < h.y + h.h) {
          scene.onHarborClick?.(h.index)
          return
        }
      }
      const r = scene.shipRect
      if (ax >= r.x && ax < r.x + r.w && ay >= r.y && ay < r.y + r.h) {
        scene.onShipClick?.()
      }
    }

    stillFrameRef.current = () => {
      scene.voyage = voyageRef.current
      scene.progress = voyageRef.current.target
      updateScene(scene, 0)
      drawFrame(ctx, scene, sprites)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()
    document.addEventListener("visibilitychange", onVisibility)
    canvas.addEventListener("click", onClick)

    if (reduced) stillFrameRef.current()
    else start()

    return () => {
      stop()
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("click", onClick)
      stillFrameRef.current = null
    }
  }, [reduced])

  React.useEffect(() => {
    voyageRef.current = voyage
    // Animated mode picks the change up next frame; stills need a redraw.
    if (reduced) stillFrameRef.current?.()
  }, [voyage, reduced])

  return { wrapRef, canvasRef }
}
