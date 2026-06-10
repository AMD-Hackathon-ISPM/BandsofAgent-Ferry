import * as React from "react"

import { AGENTS } from "@/lib/domain"
import type { Run } from "@/lib/types"
import { ANCHORS } from "./layout"
import type { Pt } from "./iso"
import { usePrefersReducedMotion } from "./state"

export interface Voyage {
  id: string
  from: Pt
  to: Pt
  color: string
  t: number
}

const DURATION_MS = 1700
const MAX_VOYAGES = 40

export function useVoyages(run: Run): Voyage[] {
  const [voyages, setVoyages] = React.useState<Voyage[]>([])
  const seen = React.useRef<Set<string>>(new Set())
  const pending = React.useRef<Voyage[]>([])
  const reduced = usePrefersReducedMotion()

  React.useEffect(() => {
    if (reduced) return
    for (const m of run.messages) {
      if (seen.current.has(m.id)) continue
      seen.current.add(m.id)
      if (!m.targetAgent || m.targetAgent === m.agent) continue
      const from = ANCHORS[m.agent]
      const to = ANCHORS[m.targetAgent]
      if (!from || !to) continue
      pending.current.push({
        id: m.id,
        from,
        to,
        color: AGENTS[m.agent].color,
        t: 0,
      })
    }
  }, [run.messages, reduced])

  React.useEffect(() => {
    if (reduced) return
    let raf = 0
    let prev = 0
    const tick = (ts: number) => {
      if (prev === 0) prev = ts
      const dt = ts - prev
      prev = ts
      setVoyages((current) => {
        const incoming = pending.current
        if (incoming.length > 0) pending.current = []
        if (current.length === 0 && incoming.length === 0) return current
        const advanced = current
          .map((v) => ({ ...v, t: v.t + dt / DURATION_MS }))
          .filter((v) => v.t < 1.06)
        return incoming.length > 0
          ? [...advanced, ...incoming].slice(-MAX_VOYAGES)
          : advanced
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  return voyages
}
