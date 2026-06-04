import { STATUS, type MigrationStatus } from "@/lib/domain"
import { cn } from "@/lib/utils"
import { Dot } from "@/features/migrations/components/status-dot"
import { toneSoft } from "@/features/migrations/components/tone"

export function StatusBadge({
  status,
  className,
}: {
  status: MigrationStatus
  className?: string
}) {
  const meta = STATUS[status]
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 border px-1.5 text-xs font-medium",
        toneSoft[meta.tone],
        className,
      )}
    >
      <Dot tone={meta.tone} pulse={meta.tone === "live"} />
      {meta.label}
    </span>
  )
}
