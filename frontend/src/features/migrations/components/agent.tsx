import { AGENTS, type AgentKey } from "@/lib/domain"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: { box: "size-5", icon: "size-3" },
  md: { box: "size-7", icon: "size-4" },
  lg: { box: "size-9", icon: "size-5" },
} as const

export function AgentGlyph({
  agent,
  size = "md",
  active = false,
  className,
}: {
  agent: AgentKey
  size?: keyof typeof SIZES
  active?: boolean
  className?: string
}) {
  const meta = AGENTS[agent]
  const Icon = meta.icon
  const s = SIZES[size]
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center border",
        s.box,
        active && "live-ring",
        className,
      )}
      style={{
        color: meta.color,
        borderColor: `color-mix(in oklch, ${meta.color} 38%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${meta.color} 13%, transparent)`,
      }}
    >
      <Icon className={s.icon} />
    </span>
  )
}

export function AgentLabel({
  agent,
  className,
  withGlyph = true,
  size = "md",
}: {
  agent: AgentKey
  className?: string
  withGlyph?: boolean
  size?: keyof typeof SIZES
}) {
  const meta = AGENTS[agent]
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {withGlyph && <AgentGlyph agent={agent} size={size} />}
      <span className="text-xs font-medium" style={{ color: meta.color }}>
        {meta.name}
      </span>
    </span>
  )
}
