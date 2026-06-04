import { cn } from "@/lib/utils"

export function FerryMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-5", className)}
    >
      <rect
        x="1.25"
        y="1.25"
        width="21.5"
        height="21.5"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <path
        d="M4 15.5h4l2-3 2.5 4.5 2-7 1.7 5.5H20"
        stroke="var(--signal)"
        strokeWidth="1.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

export function Wordmark({
  className,
  markClassName,
}: {
  className?: string
  markClassName?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <FerryMark className={markClassName} />
      <span className="text-sm font-semibold tracking-tight">Ferry</span>
    </span>
  )
}

export function WordText({ className }: { className?: string }) {
  return <span className={cn("text-sm font-semibold tracking-tight", className)}>Ferry</span>
}
