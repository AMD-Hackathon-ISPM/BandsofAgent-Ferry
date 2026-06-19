import type { StatusTone } from "@/lib/domain"
import type { AgentRunStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toneDotBg } from "@/features/migrations/components/tone"

export function Dot({
  tone,
  pulse = false,
  ring = false,
  className,
}: {
  tone: StatusTone
  pulse?: boolean
  ring?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "relative inline-block size-2 rounded-full",
        toneDotBg[tone],
        pulse && "dot-pulse",
        ring && "live-ring",
        className,
      )}
    />
  )
}

const AGENT_STATUS_TONE: Record<AgentRunStatus, { tone: StatusTone; pulse: boolean; ring: boolean }> = {
  active: { tone: "live", pulse: true, ring: true },
  blocked: { tone: "warning", pulse: true, ring: false },
  done: { tone: "success", pulse: false, ring: false },
  waiting: { tone: "idle", pulse: false, ring: false },
  idle: { tone: "idle", pulse: false, ring: false },
}

export function AgentStatusDot({
  status,
  className,
}: {
  status: AgentRunStatus
  className?: string
}) {
  const { tone, pulse, ring } = AGENT_STATUS_TONE[status]
  return <Dot tone={tone} pulse={pulse} ring={ring} className={className} />
}
