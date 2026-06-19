import type { AgentMessageVM } from "@/lib/types"
import { RUN7_STREAM } from "@/lib/mock/data"

export function subscribeRun(
  runId: string,
  onMessage: (msg: AgentMessageVM) => void,
): () => void {
  if (runId !== "run_7") return () => {}

  const queue = RUN7_STREAM.map((m) => ({ ...m }))
  const timers: number[] = []
  let i = 0

  const emitNext = () => {
    if (i >= queue.length) return
    const msg: AgentMessageVM = { ...queue[i], createdAt: new Date().toISOString() }
    onMessage(msg)
    i += 1
    if (i < queue.length) {
      timers.push(window.setTimeout(emitNext, 3600 + Math.random() * 2600))
    }
  }

  timers.push(window.setTimeout(emitNext, 2600))
  return () => timers.forEach((t) => window.clearTimeout(t))
}
