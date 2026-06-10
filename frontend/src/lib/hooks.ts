import * as React from "react"

import { isLive } from "@/lib/domain"
import type { AgentMessageVM, AgentRuntime, Run } from "@/lib/types"
import { API_URL } from "@/lib/api"
import { USE_DUMMY_DATA } from "@/lib/dev-mode"
import { subscribeRun } from "@/lib/mock/stream"

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

function getStoredToken(): string {
  try {
    const raw = localStorage.getItem("ferry.session")
    if (!raw) return ""
    return JSON.parse(raw).accessToken ?? ""
  } catch {
    return ""
  }
}

export function useLiveRun(run: Run): LiveRunState {
  const [messages, setMessages] = React.useState<AgentMessageVM[]>(run.messages)
  const [agents, setAgents] = React.useState<AgentRuntime[]>(run.agents)
  const [streamedIds, setStreamedIds] = React.useState<Set<string>>(() => new Set())

  React.useEffect(() => {
    if (!isLive(run.status)) return

    const handleMessage = (msg: AgentMessageVM) => {
      setStreamedIds((prev) => new Set(prev).add(msg.id))
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
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
            : a,
        ),
      )
    }

    if (USE_DUMMY_DATA) return subscribeRun(run.id, handleMessage)

    const token = getStoredToken()
    const url = `${API_URL}/api/runs/${run.id}/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`
    const es = new EventSource(url)

    es.onmessage = (event) => {
      try {
        handleMessage(JSON.parse(event.data) as AgentMessageVM)
      } catch {
        // ignore malformed SSE messages
      }
    }

    return () => es.close()
  }, [run.id, run.status])

  return { messages, agents, streamedIds }
}
