import * as React from "react"

import { AGENTS, type AgentKey } from "@/lib/domain"

const PULSE = 8 // px

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * Ambient "collaboration" motion for a live band room: every couple of seconds
 * a light pulse travels down the connector spine from one agent's glyph to the
 * next, tinted with the sending agent's identity color. It reads as the band
 * passing work between each other. Only runs while the run is live, and is
 * fully disabled under reduced motion.
 */
export function BandChatter({
  scrollRef,
  enabled,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  enabled: boolean
}) {
  const pulseRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!enabled || prefersReducedMotion()) return
    let alive = true
    let timer = 0

    const fire = () => {
      const scroller = scrollRef.current
      const pulse = pulseRef.current
      if (!scroller || !pulse) return

      const glyphs = Array.from(
        scroller.querySelectorAll<HTMLElement>("[data-feed-glyph]"),
      )
      if (glyphs.length < 2) return

      // Prefer recent, on-screen pairs where the two agents differ (a handoff).
      const start = Math.max(0, glyphs.length - 7)
      const pairs: Array<{ i: number; diff: boolean }> = []
      for (let i = start; i < glyphs.length - 1; i++) {
        pairs.push({ i, diff: glyphs[i].dataset.agent !== glyphs[i + 1].dataset.agent })
      }
      const differing = pairs.filter((p) => p.diff)
      const pool = differing.length ? differing : pairs
      const choice = pool[Math.floor(Math.random() * pool.length)]
      const from = glyphs[choice.i]
      const to = glyphs[choice.i + 1]

      const key = (from.dataset.agent as AgentKey) ?? "router"
      const color = AGENTS[key]?.color ?? "var(--signal)"
      const x = from.offsetLeft + from.offsetWidth / 2
      const fromY = from.offsetTop + from.offsetHeight / 2
      const toY = to.offsetTop + to.offsetHeight / 2

      pulse.style.left = `${x - PULSE / 2}px`
      pulse.style.background = color
      pulse.style.boxShadow = `0 0 10px 2px color-mix(in oklch, ${color} 60%, transparent)`
      pulse.animate(
        [
          { transform: `translateY(${fromY - PULSE / 2}px) scale(0.45)`, opacity: 0 },
          { opacity: 1, offset: 0.22 },
          { opacity: 1, offset: 0.8 },
          { transform: `translateY(${toY - PULSE / 2}px) scale(0.45)`, opacity: 0 },
        ],
        { duration: 780, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      )

      // a soft "received" ring on the agent the work lands on
      to.animate(
        [
          { boxShadow: `0 0 0 0 color-mix(in oklch, ${color} 0%, transparent)` },
          { boxShadow: `0 0 0 3px color-mix(in oklch, ${color} 26%, transparent)`, offset: 0.55 },
          { boxShadow: `0 0 0 0 color-mix(in oklch, ${color} 0%, transparent)` },
        ],
        { duration: 720, delay: 580, easing: "ease-out" },
      )
    }

    const loop = () => {
      if (!alive) return
      timer = window.setTimeout(() => {
        fire()
        loop()
      }, 2000 + Math.random() * 1100)
    }
    loop()

    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [enabled, scrollRef])

  if (!enabled) return null
  return (
    <div
      ref={pulseRef}
      data-band-pulse
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-10 size-2 rounded-full opacity-0 motion-reduce:hidden"
    />
  )
}
