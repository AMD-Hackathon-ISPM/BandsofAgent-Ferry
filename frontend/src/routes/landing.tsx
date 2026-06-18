import * as React from "react"
import { useDocumentTitle, usePrefersReducedMotion } from "@/lib/hooks"
import { LandingNav } from "@/features/landing/landing-nav"
import { Hero } from "@/features/landing/hero"
import { Problem } from "@/features/landing/problem"
import { Crossing } from "@/features/landing/crossing"
import { CrewBento } from "@/features/landing/crew-bento"
import { LiveDemo } from "@/features/landing/live-demo"
import { ArtifactsBento } from "@/features/landing/artifacts-bento"
import { ControlProof } from "@/features/landing/control-proof"
import { FinalCta } from "@/features/landing/final-cta"
import { LandingFooter } from "@/features/landing/landing-footer"

export function Landing() {
  const reduce = usePrefersReducedMotion()
  useDocumentTitle("Ferry · legacy code, ferried to a modern shore")

  // Smooth anchor scrolling, scoped to this page and skipped under reduced motion.
  React.useEffect(() => {
    if (reduce) return
    const root = document.documentElement
    const prev = root.style.scrollBehavior
    root.style.scrollBehavior = "smooth"
    return () => {
      root.style.scrollBehavior = prev
    }
  }, [reduce])

  return (
    <div className="bg-background text-foreground">
      <LandingNav />
      <main>
        <Hero />
        <Problem />
        <Crossing />
        <CrewBento />
        <LiveDemo />
        <ArtifactsBento />
        <ControlProof />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  )
}

export default Landing
