import * as React from "react"

import { isLive } from "@/lib/domain"
import type { AgentMessageVM, AgentRuntime, Run } from "@/lib/types"
import { API_URL, ensureFreshToken } from "@/lib/api"
import { USE_DUMMY_DATA } from "@/lib/dev-mode"
import { subscribeRun } from "@/lib/mock/stream"

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })
  React.useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [query])
  return matches
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)")
}

export function useDocumentTitle(title: string): void {
  React.useEffect(() => {
    document.title = title
  }, [title])
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

interface LiveRunState {
  messages: AgentMessageVM[]
  agents: AgentRuntime[]
  streamedIds: Set<string>
}

// The SSE live stream and the polled run doc deliver the same backend message with
// DIFFERENT ids (band message id vs. DB UUID), so id-only dedup misses one copy. Fall
// back to a content signature to collapse the two.
function messageSig(m: AgentMessageVM): string {
  return `${m.agent}|${m.type}|${m.phase}|${m.summary}|${m.createdAt}`
}

function mergeMessages(
  current: AgentMessageVM[],
  incoming: AgentMessageVM[]
): AgentMessageVM[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((message) => [message.id, message]))
  const sigToId = new Map(current.map((message) => [messageSig(message), message.id]))
  for (const message of incoming) {
    const existingId = byId.has(message.id)
      ? message.id
      : sigToId.get(messageSig(message))
    if (existingId !== undefined) {
      // Same message over a different transport — merge onto the existing entry so its
      // React key (and any "new" glow keyed off it) stays stable.
      byId.set(existingId, { ...byId.get(existingId)!, ...message, id: existingId })
    } else {
      byId.set(message.id, message)
      sigToId.set(messageSig(message), message.id)
    }
  }
  return [...byId.values()].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt)
    if (byTime !== 0) return byTime
    return a.id.localeCompare(b.id)
  })
}

function mergeAgents(
  current: AgentRuntime[],
  incoming: AgentRuntime[]
): AgentRuntime[] {
  if (incoming.length === 0) return current
  const currentByKey = new Map(current.map((agent) => [agent.key, agent]))
  return incoming.map((agent) => {
    const live = currentByKey.get(agent.key)
    if (!live) return agent
    return {
      ...agent,
      status:
        live.status === "active" && agent.status !== "blocked"
          ? live.status
          : agent.status,
      currentTask: live.currentTask ?? agent.currentTask,
      lastActionAt: live.lastActionAt ?? agent.lastActionAt,
    }
  })
}

export function useLiveRun(run: Run): LiveRunState {
  const [messages, setMessages] = React.useState<AgentMessageVM[]>(run.messages)
  const [agents, setAgents] = React.useState<AgentRuntime[]>(run.agents)
  const [streamedIds, setStreamedIds] = React.useState<Set<string>>(
    () => new Set()
  )

  React.useEffect(() => {
    setMessages(run.messages)
    setAgents(run.agents)
    setStreamedIds(new Set())
  }, [run.id])

  React.useEffect(() => {
    setMessages((prev) => mergeMessages(prev, run.messages))
  }, [run.messages])

  React.useEffect(() => {
    setAgents((prev) => mergeAgents(prev, run.agents))
  }, [run.agents])

  React.useEffect(() => {
    if (!isLive(run.status)) return

    const handleMessage = (msg: AgentMessageVM) => {
      setStreamedIds((prev) => new Set(prev).add(msg.id))
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id || messageSig(m) === messageSig(msg))
          ? prev
          : [...prev, msg]
      )
      setAgents((prev) =>
        prev.map((a) =>
          a.key === msg.agent
            ? {
                ...a,
                status:
                  a.status === "idle" || a.status === "waiting"
                    ? "active"
                    : a.status,
                lastActionAt: msg.createdAt,
              }
            : a
        )
      )
    }

    if (USE_DUMMY_DATA) return subscribeRun(run.id, handleMessage)

    let es: EventSource | null = null
    let closed = false
    let reconnectTimer = 0

    const connect = async () => {
      if (closed) return
      const token = await ensureFreshToken()
      if (closed) return
      const url = `${API_URL}/api/runs/${run.id}/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`
      es = new EventSource(url)
      es.onmessage = (event) => {
        try {
          handleMessage(JSON.parse(event.data) as AgentMessageVM)
        } catch {
          // Ignore malformed stream events and wait for the next update.
        }
      }
      es.onerror = () => {
        es?.close()
        es = null
        if (closed) return
        window.clearTimeout(reconnectTimer)
        reconnectTimer = window.setTimeout(() => void connect(), 3000)
      }
    }
    void connect()

    return () => {
      closed = true
      window.clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [run.id, run.status])

  return { messages, agents, streamedIds }
}
