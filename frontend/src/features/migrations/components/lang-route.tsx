import { IconArrowRight } from "@tabler/icons-react"

import {
  SOURCE_LANGUAGE_LABEL,
  TARGET_LANGUAGE_LABEL,
  type SourceLanguage,
  type TargetLanguage,
} from "@/lib/domain"
import { cn } from "@/lib/utils"

export function LangRoute({
  source,
  target,
  className,
}: {
  source: SourceLanguage
  target: TargetLanguage
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs", className)}>
      <span className="border border-border px-1.5 py-0.5 text-muted-foreground">
        {SOURCE_LANGUAGE_LABEL[source]}
      </span>
      <IconArrowRight className="size-3 text-muted-foreground/70" />
      <span className="border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-medium text-primary-bright">
        {TARGET_LANGUAGE_LABEL[target]}
      </span>
    </span>
  )
}
