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


export function useLiveRun(run: Run): LiveRunState {
  const [messages, setMessages] = React.useState<AgentMessageVM[]>(run.messages)
  const [agents, setAgents] = React.useState<AgentRuntime[]>(run.agents)
  const [streamedIds, setStreamedIds] = React.useState<Set<string>>(
    () => new Set()
  )

  React.useEffect(() => {
    if (!isLive(run.status)) return

    const handleMessage = (msg: AgentMessageVM) => {
      setStreamedIds((prev) => new Set(prev).add(msg.id))
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
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
