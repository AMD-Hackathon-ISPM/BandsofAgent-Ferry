import * as React from "react"

import { usePrefersReducedMotion } from "@/lib/hooks"
import { bakeSprites } from "./sprites"
import { createScene, updateScene } from "./scene"
import { drawFrame } from "./render"
import {
  clampPan,
  enterInspect,
  exitInspect,
  snapInspect,
  updateInspect,
} from "./inspect"
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
  options: {
    onHarborClick?: (index: number) => void
    /** Fires when the ship-inspection mode is entered/left. */
    onInspectChange?: (active: boolean) => void
  } = {}
): {
  wrapRef: React.RefObject<HTMLDivElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
} {
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()
  const voyageRef = React.useRef(voyage)
  const onHarborClickRef = React.useRef(options.onHarborClick)
  const onInspectChangeRef = React.useRef(options.onInspectChange)
  const stillFrameRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    onHarborClickRef.current = options.onHarborClick
    onInspectChangeRef.current = options.onInspectChange
  }, [options.onHarborClick, options.onInspectChange])

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

    let lastInspecting = false
    const notifyInspect = () => {
      const active = scene.mode === "inspect"
      if (active !== lastInspecting) {
        lastInspecting = active
        onInspectChangeRef.current?.(active)
      }
    }
    scene.onShipClick = () => {
      enterInspect(scene)
      if (reduced) {
        snapInspect(scene)
        stillFrameRef.current?.()
      }
      notifyInspect()
    }
    const leaveInspect = () => {
      exitInspect(scene)
      if (reduced) {
        snapInspect(scene)
        stillFrameRef.current?.()
        notifyInspect()
      }
    }
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
      updateInspect(scene, dt)
      notifyInspect()
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

    const toArt = (e: MouseEvent): { x: number; y: number } | null => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || scene.bufW === 0) return null
      return {
        x: ((e.clientX - rect.left) / rect.width) * scene.bufW,
        y: ((e.clientY - rect.top) / rect.height) * scene.bufH,
      }
    }

    const onClick = (e: MouseEvent) => {
      const p = toArt(e)
      if (!p) return
      const r = scene.shipRect
      const onShip = p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
      if (scene.mode === "inspect") {
        // Harbors are inert while inspecting; a real click (not the tail end
        // of a drag) outside the ship puts it back.
        if (!dragMoved && !onShip) leaveInspect()
        return
      }
      for (let i = scene.harborRects.length - 1; i >= 0; i--) {
        const h = scene.harborRects[i]
        if (p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h) {
          scene.onHarborClick?.(h.index)
          return
        }
      }
      if (onShip) scene.onShipClick?.()
    }

    // Drag-to-pan while holding the inspection pose.
    let dragging = false
    let dragMoved = false
    let dragLastX = 0
    let dragLastY = 0
    const onMouseDown = (e: MouseEvent) => {
      dragMoved = false // every press starts as a potential clean click
      if (scene.mode !== "inspect" || scene.inspect?.phase !== "hold") return
      dragging = true
      dragLastX = e.clientX
      dragLastY = e.clientY
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return
      const ins = scene.inspect
      if (!ins || ins.phase !== "hold") return
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || scene.bufW === 0) return
      const k = scene.bufW / rect.width
      ins.panX += (e.clientX - dragLastX) * k
      ins.panY += (e.clientY - dragLastY) * k
      clampPan(scene, ins)
      if (
        Math.abs(e.clientX - dragLastX) * k > 1 ||
        Math.abs(e.clientY - dragLastY) * k > 1
      ) {
        dragMoved = true
      }
      dragLastX = e.clientX
      dragLastY = e.clientY
      if (reduced) stillFrameRef.current?.()
    }
    const onMouseUp = () => {
      dragging = false
    }

    const onCanvasHover = (e: MouseEvent) => {
      if (dragging) {
        canvas.style.cursor = "grabbing"
        return
      }
      if (scene.mode === "inspect") {
        canvas.style.cursor =
          scene.inspect?.phase === "hold" ? "grab" : "default"
        return
      }
      const p = toArt(e)
      if (!p) return
      const r = scene.shipRect
      let interactive =
        p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
      if (!interactive) {
        for (const h of scene.harborRects) {
          if (p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h) {
            interactive = true
            break
          }
        }
      }
      canvas.style.cursor = interactive ? "pointer" : "default"
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (scene.mode !== "inspect") return
      if (e.key === "Escape") {
        leaveInspect()
        e.preventDefault()
        return
      }
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        scene.keys.add(e.key)
        const ins = scene.inspect
        if (reduced && ins && ins.phase === "hold") {
          // No animation loop to consume held keys — pan in steps instead.
          const step = 24
          if (e.key === "ArrowLeft") ins.panX -= step
          if (e.key === "ArrowRight") ins.panX += step
          if (e.key === "ArrowUp") ins.panY -= step
          if (e.key === "ArrowDown") ins.panY += step
          clampPan(scene, ins)
          stillFrameRef.current?.()
        }
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      scene.keys.delete(e.key)
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
    canvas.addEventListener("mousedown", onMouseDown)
    canvas.addEventListener("mousemove", onCanvasHover)
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)

    if (reduced) stillFrameRef.current()
    else start()

    return () => {
      stop()
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("click", onClick)
      canvas.removeEventListener("mousedown", onMouseDown)
      canvas.removeEventListener("mousemove", onCanvasHover)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
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
