import * as React from "react"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconCode,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { toneDotBg, toneSoft } from "@/features/migrations/components/tone"

// Lazy so Shiki + the Pierre file tree stay out of the initial bundle and load
// only when a code viewer is first opened.
const CodeViewerDialog = React.lazy(
  () => import("@/features/runs/components/code-viewer")
)

function ToneChip({
  tone,
  children,
}: {
  tone: StatusTone
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 border px-1.5 text-[11px] font-medium",
        toneSoft[tone]
      )}
    >
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

function OutputDisclosure({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="border-b border-border/80 pb-4 last:border-b-0 last:pb-0"
    >
      <CollapsibleTrigger className="group/section flex w-full items-center justify-between gap-3 py-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
          {title}
          {typeof count === "number" && (
            <span className="tabular text-muted-foreground/80">{count}</span>
          )}
        </span>
        <IconChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]/section:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
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
  const needsAction = !approvedBy

  const approve = () => {
    setConfirming(false)
    onApprove()
    toast.success("Database plan approved", {
      description: `The InnoDB conversion is cleared to run (~${formatDuration(plan.estimatedSeconds * 1000)}).`,
    })
  }

  return (
    <section
      id="db-plan"
      className={cn(
        "scroll-mt-4 border bg-card/35",
        needsAction ? "border-warning/35" : "border-border"
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border px-3 py-3">
        {needsAction && (
          <span className="self-start border border-warning/40 bg-warning/10 px-2 py-1 font-mono text-[10px] font-bold text-warning uppercase">
            Action required
          </span>
        )}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Database migration plan</h3>
          <ToneChip tone={tone}>{RISK_LABEL[plan.riskLevel]}</ToneChip>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {plan.requiresDowntime ? (
            <span className="inline-flex w-full items-center gap-1.5 border border-warning/30 bg-warning/10 px-2 py-2 text-warning">
              <IconClock className="size-3" />
              Requires downtime · ~
              {formatDuration(plan.estimatedSeconds * 1000)}
            </span>
          ) : (
            <span className="inline-flex w-full items-center gap-1.5 border border-success/30 bg-success/10 px-2 py-2 text-success">
              <IconCircleCheck className="size-3" />
              Online · no downtime
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-1.5">
          {plan.riskFactors.map((factor, i) => (
            <li
              key={i}
              className="flex gap-2 text-[12px] text-muted-foreground"
            >
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
              <span className="text-success/70">
                {" "}
                · {elapsed(plan.approvedAt)} ago
              </span>
            )}
          </div>
        ) : canApprove ? (
          confirming ? (
            <div className="flex flex-col gap-2 border border-warning/35 bg-warning/10 p-2.5">
              <p className="text-[12px] text-warning">
                This holds a write lock for about{" "}
                {formatDuration(plan.estimatedSeconds * 1000)}. Approve the
                conversion?
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={approve}
                  className="bg-warning text-warning-foreground hover:bg-warning/90"
                >
                  Approve plan
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming(true)}
              className="self-start"
            >
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

function DatabaseSection({
  run,
  canApprove,
  dbApproved,
  onApproveDbPlan,
}: {
  run: Run
  canApprove: boolean
  dbApproved: boolean
  onApproveDbPlan: () => void
}) {
  if (!run.dbPlan) return null
  return (
    <OutputDisclosure title="Database">
      <DbPlanCard
        run={run}
        canApprove={canApprove}
        approved={dbApproved}
        onApprove={onApproveDbPlan}
      />
    </OutputDisclosure>
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
          <span className="tabular text-muted-foreground">#{pr.number}</span>{" "}
          {pr.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <IconGitBranch className="size-3" />
          <span className="border border-border px-1.5 py-0.5">
            {pr.sourceBranch}
          </span>
          <IconChevronRight className="size-3" />
          <span className="border border-border px-1.5 py-0.5">
            {pr.targetBranch}
          </span>
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

function ArtifactRow({
  artifact,
  onOpen,
}: {
  artifact: Artifact
  onOpen: (path: string) => void
}) {
  const meta = ARTIFACT_TYPES[artifact.type]
  const Icon = meta.icon
  return (
    <button
      type="button"
      onClick={() => onOpen(artifact.fileName)}
      aria-label={`View ${artifact.fileName}`}
      className="group/row flex w-full items-center gap-2.5 border border-border px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[12px] text-foreground">
          {artifact.fileName}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <AgentGlyph agent={artifact.createdBy} size="sm" />
          <span className="tabular">{formatBytes(artifact.sizeBytes)}</span>
        </span>
      </span>
      <IconCode className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100" />
    </button>
  )
}

function ArtifactsSection({
  run,
  onOpen,
}: {
  run: Run
  onOpen: (path?: string) => void
}) {
  if (run.artifacts.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">
        No artifacts yet. They appear here as the band produces them.
      </p>
    )
  }
  return (
    <OutputDisclosure title="Artifacts" count={run.artifacts.length}>
      <div className="flex flex-col gap-3">
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => onOpen()}
        >
          <IconCode data-icon="inline-start" />
          Browse code
        </Button>
        {ARTIFACT_GROUP_ORDER.map((group) => {
          const items = run.artifacts.filter(
            (a) => ARTIFACT_TYPES[a.type].group === group
          )
          if (items.length === 0) return null
          return (
            <div key={group} className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-wide text-muted-foreground/70">
                {group}
              </span>
              <div className="flex flex-col gap-1.5">
                {items.map((a) => (
                  <ArtifactRow key={a.id} artifact={a} onOpen={onOpen} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </OutputDisclosure>
  )
}

export function OutputsPanel({
  run,
  canApprove,
  dbApproved,
  onApproveDbPlan,
  className,
  showHeader = true,
}: {
  run: Run
  canApprove: boolean
  dbApproved: boolean
  onApproveDbPlan: () => void
  className?: string
  showHeader?: boolean
}) {
  const empty = !run.dbPlan && !run.pr && run.artifacts.length === 0
  const [viewerOpen, setViewerOpen] = React.useState(false)
  const [everOpened, setEverOpened] = React.useState(false)
  const [requestedPath, setRequestedPath] = React.useState<string | undefined>(
    undefined
  )

  const openViewer = (path?: string) => {
    setRequestedPath(path)
    setEverOpened(true)
    setViewerOpen(true)
  }

  return (
    <section
      className={cn("flex flex-col", className)}
      aria-label="Run outputs"
    >
      {showHeader && (
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">
            Outputs
          </h2>
        </div>
      )}
      <div className="flex flex-col gap-4 overflow-y-auto p-3">
        {empty ? (
          <p className="px-1 py-8 text-center text-xs text-muted-foreground">
            Outputs collect here: generated code, the database plan, and the
            pull request.
          </p>
        ) : (
          <>
            <DatabaseSection
              run={run}
              canApprove={canApprove}
              dbApproved={dbApproved}
              onApproveDbPlan={onApproveDbPlan}
            />
            {run.pr && <PullRequestCard run={run} />}
            <ArtifactsSection run={run} onOpen={openViewer} />
          </>
        )}
      </div>
      {everOpened && (
        <React.Suspense fallback={null}>
          <CodeViewerDialog
            artifacts={run.artifacts}
            open={viewerOpen}
            onOpenChange={setViewerOpen}
            initialPath={requestedPath}
          />
        </React.Suspense>
      )}
    </section>
  )
}
