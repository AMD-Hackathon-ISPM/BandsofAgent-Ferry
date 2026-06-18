import * as React from "react"

import { usePrefersReducedMotion } from "@/lib/hooks"
import { bakeSprites } from "./sprites"
import { bakeHarborScene, HARBOR_ZOOM } from "./harbor"
import { bakeFerryAt } from "./voxel/bake"
import {
  canInspect,
  createScene,
  snapStage,
  updateScene,
  type VoyageStage,
} from "./scene"
import { drawFrame } from "./render"
import {
  clampPan,
  enterInspect,
  exitInspect,
  snapInspect,
  updateInspect,
  zoomInspect,
} from "./inspect"
import { VOYAGE_STOP_COUNT, type VoyageStatus } from "./progress"

/** Art pixels are this many CSS px wide (snapped to the device-pixel grid). */
const PIXEL_SCALE = 2

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
    /** Fires when the ship-inspection mode is entered/left. */
    onInspectChange?: (active: boolean) => void
    /** Fires when the pointer enters/leaves the clickable ship at open water. */
    onInteractiveChange?: (hovering: boolean) => void
    onInspectableChange?: (inspectable: boolean) => void
    /** Fires whenever the spatial stage changes (dock → depart → sea …). */
    onStageChange?: (stage: VoyageStage) => void
    /** Open on the full-screen loading harbor before sailing out. */
    introDock?: boolean
    /** Override where the ferry locks on open water (fraction of buffer width). */
    seaXFrac?: number
  } = {}
): {
  wrapRef: React.RefObject<HTMLDivElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
} {
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()
  const voyageRef = React.useRef(voyage)
  const onInspectChangeRef = React.useRef(options.onInspectChange)
  const onInteractiveChangeRef = React.useRef(options.onInteractiveChange)
  const onInspectableChangeRef = React.useRef(options.onInspectableChange)
  const onStageChangeRef = React.useRef(options.onStageChange)
  const introDockRef = React.useRef(options.introDock)
  const seaXFracRef = React.useRef(options.seaXFrac)
  const stillFrameRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    seaXFracRef.current = options.seaXFrac
  }, [options.seaXFrac])

  React.useEffect(() => {
    onInspectChangeRef.current = options.onInspectChange
    onInteractiveChangeRef.current = options.onInteractiveChange
    onInspectableChangeRef.current = options.onInspectableChange
    onStageChangeRef.current = options.onStageChange
  }, [
    options.onInspectChange,
    options.onInteractiveChange,
    options.onInspectableChange,
    options.onStageChange,
  ])

  React.useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const sprites = bakeSprites()
    const harbor = bakeHarborScene()
    const harborFerry = bakeFerryAt(HARBOR_ZOOM)
    const scene = createScene()
    scene.voyage = voyageRef.current
    if (seaXFracRef.current != null) scene.seaXFrac = seaXFracRef.current
    // A fresh launch plays the loading harbor first; otherwise (refresh, or a
    // run already underway) land directly in the stage the status implies.
    // Reduced motion skips the intro entirely.
    snapStage(scene, { forceDock: Boolean(introDockRef.current) && !reduced })
    if (import.meta.env.DEV) {
      // Dev console hooks: inspect live state and fast-forward the sim
      // deterministically (occluded tabs throttle rAF to ~1fps).
      const w = window as unknown as {
        __scene?: unknown
        __tick?: (seconds: number) => void
      }
      w.__scene = scene
      w.__tick = (seconds: number) => {
        const steps = Math.ceil(seconds * 60)
        for (let i = 0; i < steps; i++) {
          updateScene(scene, 1 / 60)
          updateInspect(scene, 1 / 60)
        }
        drawFrame(ctx, scene, sprites, harbor, harborFerry)
      }
    }

    let lastInspecting = false
    const notifyInspect = () => {
      const active = scene.mode === "inspect"
      if (active !== lastInspecting) {
        lastInspecting = active
        onInspectChangeRef.current?.(active)
      }
    }
    let lastStage = scene.stage
    const notifyStage = () => {
      if (scene.stage !== lastStage) {
        lastStage = scene.stage
        onStageChangeRef.current?.(scene.stage)
      }
    }
    let lastInspectable = false
    const notifyInspectable = () => {
      const inspectable = scene.mode === "sea" && canInspect(scene)
      if (inspectable !== lastInspectable) {
        lastInspectable = inspectable
        onInspectableChangeRef.current?.(inspectable)
      }
    }
    // Pointer-over-ship affordance (the inspect reticle + hover hint). Mirrors
    // the inspect/stage notifiers: only fires React on edges, not per frame.
    let lastInteractive = false
    const setShipHover = (hovering: boolean) => {
      scene.shipHover = hovering
      if (hovering !== lastInteractive) {
        lastInteractive = hovering
        onInteractiveChangeRef.current?.(hovering)
      }
    }
    scene.onShipClick = () => {
      setShipHover(false) // the ship's leaving the water; drop the hint at once
      enterInspect(scene)
      if (reduced) {
        snapInspect(scene)
        stillFrameRef.current?.()
      }
      notifyInspect()
      notifyInspectable()
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
      drawFrame(ctx, scene, sprites, harbor, harborFerry)
    }

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((ts - (prev || ts)) / 1000, 0.1)
      prev = ts
      scene.voyage = voyageRef.current
      updateScene(scene, dt)
      updateInspect(scene, dt)
      notifyInspect()
      notifyStage()
      notifyInspectable()
      drawFrame(ctx, scene, sprites, harbor, harborFerry)
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
      const onShip =
        p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
      if (scene.mode === "inspect") {
        // A real click (not the tail end of a drag) outside the ship puts it
        // back in the water.
        if (!dragMoved && !onShip) leaveInspect()
        return
      }
      if (onShip && canInspect(scene)) scene.onShipClick?.()
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

    // Wheel-zoom the cutaway in integer voxel steps while holding it.
    let wheelAccum = 0
    const onWheel = (e: WheelEvent) => {
      if (scene.mode !== "inspect" || scene.inspect?.phase !== "hold") return
      e.preventDefault()
      wheelAccum += e.deltaY
      const NOTCH = 40
      while (Math.abs(wheelAccum) >= NOTCH) {
        const dir = wheelAccum > 0 ? -1 : 1 // scroll up = zoom in
        wheelAccum -= Math.sign(wheelAccum) * NOTCH
        if (zoomInspect(scene, dir) && reduced) stillFrameRef.current?.()
      }
    }

    const onCanvasHover = (e: MouseEvent) => {
      if (dragging) {
        canvas.style.cursor = "grabbing"
        return
      }
      if (scene.mode === "inspect") {
        canvas.style.cursor =
          scene.inspect?.phase === "hold" ? "grab" : "default"
        setShipHover(false)
        return
      }
      const p = toArt(e)
      if (!p) return
      const r = scene.shipRect
      const interactive =
        canInspect(scene) &&
        p.x >= r.x &&
        p.x < r.x + r.w &&
        p.y >= r.y &&
        p.y < r.y + r.h
      canvas.style.cursor = interactive ? "pointer" : "default"
      setShipHover(interactive)
    }
    const onCanvasLeave = () => {
      setShipHover(false)
      canvas.style.cursor = "default"
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // Dev-only Space cast-off skips dwell/readiness gates for scene testing;
      // production waits for the run to become live.
      if (import.meta.env.DEV && (e.key === " " || e.code === "Space")) {
        const t = e.target as HTMLElement | null
        const typing =
          t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.isContentEditable)
        if (!typing && scene.mode === "sea" && scene.stage === "dock") {
          scene.castOff = true
          e.preventDefault()
          if (reduced) stillFrameRef.current?.() // jump straight to sea
          return
        }
      }
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
          const step = 36
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
      snapStage(scene) // no animation loop to play transitions — jump there
      updateScene(scene, 0)
      notifyStage()
      notifyInspectable()
      drawFrame(ctx, scene, sprites, harbor, harborFerry)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()
    document.addEventListener("visibilitychange", onVisibility)
    canvas.addEventListener("click", onClick)
    canvas.addEventListener("mousedown", onMouseDown)
    canvas.addEventListener("mousemove", onCanvasHover)
    canvas.addEventListener("mouseleave", onCanvasLeave)
    canvas.addEventListener("wheel", onWheel, { passive: false })
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
      canvas.removeEventListener("mouseleave", onCanvasLeave)
      canvas.removeEventListener("wheel", onWheel)
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
