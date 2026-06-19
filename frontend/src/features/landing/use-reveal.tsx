import * as React from "react"

import { cn } from "@/lib/utils"

function prefersReducedMotionNow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * Scroll-into-view reveal. The element is always in the DOM; this only governs
 * the entrance transition, so content never depends on JS running to be present.
 * Reduced-motion (and environments without IntersectionObserver) reveal at once
 * via the initial state, so the effect never sets state synchronously.
 */
function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.15) {
  const ref = React.useRef<T>(null)
  const [shown, setShown] = React.useState(
    () => typeof IntersectionObserver === "undefined" || prefersReducedMotionNow(),
  )

  React.useEffect(() => {
    const el = ref.current
    if (!el || shown || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    )
    io.observe(el)
    // Safety net: never let content stay hidden if the observer never reports
    // (background tabs, headless renderers, crawlers). The reveal is an
    // enhancement, not a gate on the content existing.
    const fallback = window.setTimeout(() => setShown(true), 1400)
    return () => {
      io.disconnect()
      window.clearTimeout(fallback)
    }
  }, [shown, threshold])

  return { ref, shown }
}

/**
 * Wrapper that fades + lifts its children into place on first view. `delay`
 * (ms) staggers siblings; the global reduced-motion rule zeroes the duration.
 */
export function Reveal({
  delay = 0,
  threshold,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { delay?: number; threshold?: number }) {
  const { ref, shown } = useReveal<HTMLDivElement>(threshold)
  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
