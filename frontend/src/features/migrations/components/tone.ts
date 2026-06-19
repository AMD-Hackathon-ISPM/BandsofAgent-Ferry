import type { StatusTone } from "@/lib/domain"

export const toneText: Record<StatusTone, string> = {
  idle: "text-muted-foreground",
  live: "text-signal",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
}

export const toneSoft: Record<StatusTone, string> = {
  idle: "bg-muted/60 text-muted-foreground border-border",
  live: "bg-signal/12 text-signal border-signal/25",
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/14 text-warning border-warning/30",
  danger: "bg-destructive/12 text-destructive border-destructive/25",
}

export const toneDotBg: Record<StatusTone, string> = {
  idle: "bg-muted-foreground/60",
  live: "bg-signal",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
}
