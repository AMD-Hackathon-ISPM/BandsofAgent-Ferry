import { toast } from "sonner"
import { IconCopy, IconDownload } from "@tabler/icons-react"

import { AGENTS, ARTIFACT_TYPES } from "@/lib/domain"
import { formatBytes } from "@/lib/format"
import type { Artifact } from "@/lib/types"
import { artifactBody, baseName } from "@/features/runs/lib/artifact-tree"
import { AgentGlyph } from "@/features/migrations/components/agent"
import { Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Reading view for a generated markdown report (migration / risk / PR notes).
 * Opened from a report chip in the band feed. Code files use the code viewer;
 * reports are documents, so they get a prose column instead of a file tree.
 */
export function ReportDialog({
  artifact,
  open,
  onOpenChange,
}: {
  artifact: Artifact | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const meta = artifact ? ARTIFACT_TYPES[artifact.type] : null
  const body = artifact ? artifactBody(artifact) : ""

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body)
      toast.success("Copied to clipboard")
    } catch {
      toast.error("Couldn't copy")
    }
  }

  const download = () => {
    if (!artifact) return
    const name = baseName(artifact.fileName)
    const blob = new Blob([body], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    toast(`Downloaded ${name}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-[min(820px,92vw)] flex-col gap-0 overflow-hidden p-0">
        <DialogDescription className="sr-only">
          Generated report for this run.
        </DialogDescription>
        {artifact && meta ? (
          <>
            <header className="flex items-center gap-2.5 border-b border-border py-2.5 pr-11 pl-3.5">
              <meta.icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col">
                <DialogTitle className="truncate font-mono text-[13px] font-medium">
                  {artifact.fileName}
                </DialogTitle>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <AgentGlyph agent={artifact.createdBy} size="sm" />
                  <span style={{ color: AGENTS[artifact.createdBy].color }}>
                    {AGENTS[artifact.createdBy].name}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="tabular">
                    {formatBytes(artifact.sizeBytes)}
                  </span>
                </span>
              </div>
              <Badge
                variant="outline"
                className="font-mono text-[10px] tracking-wide"
              >
                {meta.label.toUpperCase()}
              </Badge>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Copy report"
                onClick={copy}
              >
                <IconCopy />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Download ${baseName(artifact.fileName)}`}
                onClick={download}
              >
                <IconDownload />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <Markdown
                content={body}
                className="mx-auto w-full max-w-[72ch] px-6 py-6"
              />
            </div>
          </>
        ) : (
          <DialogTitle className="sr-only">Report</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  )
}
