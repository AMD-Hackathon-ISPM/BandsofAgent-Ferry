import * as React from "react"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconDownload,
  IconExternalLink,
  IconGitBranch,
} from "@tabler/icons-react"

import {
  ARTIFACT_GROUP_ORDER,
  ARTIFACT_TYPES,
  RISK_LABEL,
  RISK_TONE,
  type StatusTone,
} from "@/lib/domain"
import { elapsed, formatBytes, formatDuration } from "@/lib/format"
import type { Artifact, PrStatus, Run } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AgentGlyph } from "@/features/migrations/components/agent"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { toneDotBg, toneSoft } from "@/features/migrations/components/tone"

function ToneChip({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 border px-1.5 text-[11px] font-medium", toneSoft[tone])}>
      <span className={cn("size-1.5 rounded-full", toneDotBg[tone])} />
      {children}
    </span>
  )
}

function CodePreview({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto border border-border bg-background/60 p-2.5 text-[11px] leading-relaxed text-foreground/85">
      <code>{code}</code>
    </pre>
  )
}

function DbPlanCard({
  run,
  canApprove,
  approved,
  onApprove,
}: {
  run: Run
  canApprove: boolean
  approved: boolean
  onApprove: () => void
}) {
  const plan = run.dbPlan!
  const [confirming, setConfirming] = React.useState(false)
  const tone = RISK_TONE[plan.riskLevel]
  const approvedBy = plan.approvedBy ?? (approved ? "you" : undefined)

  const approve = () => {
    setConfirming(false)
    onApprove()
    toast.success("Database plan approved", {
      description: `The InnoDB conversion is cleared to run (~${formatDuration(plan.estimatedSeconds * 1000)}).`,
    })
  }

  return (
    <section id="db-plan" className="scroll-mt-4 border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h3 className="text-xs font-semibold tracking-wide">Database migration plan</h3>
        <ToneChip tone={tone}>{RISK_LABEL[plan.riskLevel]}</ToneChip>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {plan.requiresDowntime ? (
            <span className="inline-flex items-center gap-1.5 border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-warning">
              <IconClock className="size-3" />
              Requires downtime · ~{formatDuration(plan.estimatedSeconds * 1000)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 border border-success/30 bg-success/10 px-1.5 py-0.5 text-success">
              <IconCircleCheck className="size-3" />
              Online · no downtime
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-1.5">
          {plan.riskFactors.map((factor, i) => (
            <li key={i} className="flex gap-2 text-[12px] text-muted-foreground">
              <IconAlertTriangle className="mt-0.5 size-3 shrink-0 text-warning/80" />
              <span>{factor}</span>
            </li>
          ))}
        </ul>

        <Collapsible>
          <CollapsibleTrigger className="group/sql inline-flex items-center gap-1 text-[11px] text-muted-foreground outline-none hover:text-foreground">
            <IconChevronRight className="size-3 transition-transform group-data-[state=open]/sql:rotate-90" />
            Migration SQL
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1.5">
            <CodePreview code={plan.migrationSqlPreview} />
          </CollapsibleContent>
        </Collapsible>

        {approvedBy ? (
          <div className="flex items-center gap-1.5 border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs text-success">
            <IconCircleCheck className="size-3.5" />
            Approved by {approvedBy === "you" ? "you" : approvedBy}
            {plan.approvedAt && approvedBy !== "you" && (
              <span className="text-success/70"> · {elapsed(plan.approvedAt)} ago</span>
            )}
          </div>
        ) : canApprove ? (
          confirming ? (
            <div className="flex flex-col gap-2 border border-warning/35 bg-warning/10 p-2.5">
              <p className="text-[12px] text-warning">
                This holds a write lock for about {formatDuration(plan.estimatedSeconds * 1000)}. Approve the conversion?
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={approve}
                  className="bg-warning text-warning-foreground hover:bg-warning/90"
                >
                  Approve plan
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)} className="self-start">
              Review and approve
            </Button>
          )
        ) : (
          <p className="text-[11px] text-muted-foreground">
            An owner or admin approves this plan.
          </p>
        )}
      </div>
    </section>
  )
}

const PR_TONE: Record<PrStatus, StatusTone> = {
  merged: "success",
  open: "live",
  draft: "idle",
  closed: "danger",
}
const PR_LABEL: Record<PrStatus, string> = {
  merged: "Merged",
  open: "Open",
  draft: "Draft",
  closed: "Closed",
}

function PullRequestCard({ run }: { run: Run }) {
  const pr = run.pr!
  return (
    <section className="border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h3 className="text-xs font-semibold tracking-wide">Pull request</h3>
        <ToneChip tone={PR_TONE[pr.status]}>{PR_LABEL[pr.status]}</ToneChip>
      </div>
      <div className="flex flex-col gap-2.5 p-3">
        <p className="text-[13px] text-foreground">
          <span className="text-muted-foreground">#{pr.number}</span> {pr.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <IconGitBranch className="size-3" />
          <span className="border border-border px-1.5 py-0.5">{pr.sourceBranch}</span>
          <IconChevronRight className="size-3" />
          <span className="border border-border px-1.5 py-0.5">{pr.targetBranch}</span>
        </div>
        <Button asChild size="sm" variant="outline" className="self-start">
          <a href={pr.url} target="_blank" rel="noreferrer">
            <IconExternalLink data-icon="inline-start" />
            Open on GitHub
          </a>
        </Button>
      </div>
    </section>
  )
}

function ArtifactRow({ artifact }: { artifact: Artifact }) {
  const meta = ARTIFACT_TYPES[artifact.type]
  const Icon = meta.icon
  return (
    <Collapsible className="border border-border">
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-foreground">{artifact.fileName}</span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <AgentGlyph agent={artifact.createdBy} size="sm" />
            <span className="tabular">{formatBytes(artifact.sizeBytes)}</span>
          </span>
        </span>
        <div className="flex items-center gap-0.5">
          {artifact.preview && (
            <CollapsibleTrigger asChild>
              <Button size="xs" variant="ghost" className="group/pv text-muted-foreground">
                <IconChevronRight className="transition-transform group-data-[state=open]/pv:rotate-90" />
                Preview
              </Button>
            </CollapsibleTrigger>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Download ${artifact.fileName}`}
            className="text-muted-foreground"
            onClick={() => toast(`Downloading ${artifact.fileName}`)}
          >
            <IconDownload />
          </Button>
        </div>
      </div>
      {artifact.preview && (
        <CollapsibleContent className="border-t border-border p-2.5">
          <CodePreview code={artifact.preview} />
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

function ArtifactsSection({ run }: { run: Run }) {
  if (run.artifacts.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">
        No artifacts yet. They appear here as the band produces them.
      </p>
    )
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide">Artifacts</h3>
        <span className="text-[11px] text-muted-foreground">{run.artifacts.length}</span>
      </div>
      {ARTIFACT_GROUP_ORDER.map((group) => {
        const items = run.artifacts.filter((a) => ARTIFACT_TYPES[a.type].group === group)
        if (items.length === 0) return null
        return (
          <div key={group} className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-wide text-muted-foreground/70">{group}</span>
            <div className="flex flex-col gap-1.5">
              {items.map((a) => (
                <ArtifactRow key={a.id} artifact={a} />
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

export function OutputsPanel({
  run,
  canApprove,
  dbApproved,
  onApproveDbPlan,
  className,
}: {
  run: Run
  canApprove: boolean
  dbApproved: boolean
  onApproveDbPlan: () => void
  className?: string
}) {
  const empty = !run.dbPlan && !run.pr && run.artifacts.length === 0
  return (
    <section className={cn("flex flex-col", className)} aria-label="Run outputs">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <h2 className="text-xs font-semibold tracking-wide">Outputs</h2>
      </div>
      <div className="flex flex-col gap-4 overflow-y-auto p-3">
        {empty ? (
          <p className="px-1 py-8 text-center text-xs text-muted-foreground">
            Outputs collect here: generated code, the database plan, and the pull request.
          </p>
        ) : (
          <>
            {run.dbPlan && (
              <DbPlanCard run={run} canApprove={canApprove} approved={dbApproved} onApprove={onApproveDbPlan} />
            )}
            {run.pr && <PullRequestCard run={run} />}
            {(run.dbPlan || run.pr) && run.artifacts.length > 0 && <Separator />}
            <ArtifactsSection run={run} />
          </>
        )}
      </div>
    </section>
  )
}
