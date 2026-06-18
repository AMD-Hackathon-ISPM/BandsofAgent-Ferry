import * as React from "react"

import { AGENTS, ARTIFACT_TYPES } from "@/lib/domain"
import type { Artifact } from "@/lib/types"
import { formatBytes } from "@/lib/format"
import { getRun } from "@/lib/mock/data"
import { cn } from "@/lib/utils"
import { useHighlighted } from "@/features/runs/lib/highlighter"
import { AgentGlyph } from "@/features/migrations/components/agent"
import { Badge } from "@/components/ui/badge"
import { Reveal } from "./use-reveal"

function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  const meta = ARTIFACT_TYPES[artifact.type]
  const body = (artifact.content ?? artifact.preview ?? "").trimEnd()
  const html = useHighlighted(body, meta.language)
  const agent = AGENTS[artifact.createdBy]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        <meta.icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-[13px] font-medium">{artifact.fileName}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <AgentGlyph agent={artifact.createdBy} size="sm" />
          <span className="hidden sm:inline" style={{ color: agent.color }}>
            {agent.name}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular">{formatBytes(artifact.sizeBytes)}</span>
        </span>
        <Badge variant="outline" className="font-mono text-[10px] tracking-wide">
          {meta.language.toUpperCase()}
        </Badge>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-3.5">
        {html ? (
          <div className="code-surface" data-wrap="false" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="flex flex-col gap-1.5 py-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="h-3 animate-pulse bg-muted"
                style={{ width: `${40 + ((i * 37) % 55)}%` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ArtifactsBento() {
  const run = getRun("run_7")!
  const artifacts = run.artifacts
  const [activeId, setActiveId] = React.useState(artifacts[0]?.id)
  const active = artifacts.find((a) => a.id === activeId) ?? artifacts[0]

  return (
    <section id="artifacts" className="scroll-mt-16 bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-24 sm:px-6 sm:pt-6 sm:pb-32">
        <Reveal className="max-w-2xl">
          <h2 className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
            What arrives on the other side.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Not a black-box rewrite. Every run produces real, reviewable files: the translated
            code, the tests that prove it, the database migration and its rollback. Here is the
            output from the payroll run, exactly as the band wrote it.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-12">
          <div className="grid grid-cols-1 overflow-hidden border border-border bg-card/40 lg:grid-cols-[20rem_1fr]">
            <div className="border-b border-border lg:border-r lg:border-b-0" role="list">
              <div className="border-b border-border px-3.5 py-2.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Artifacts · {artifacts.length}
              </div>
              <ul className="max-h-72 overflow-auto lg:max-h-[28rem]">
                {artifacts.map((a) => {
                  const meta = ARTIFACT_TYPES[a.type]
                  const selected = a.id === active?.id
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(a.id)}
                        aria-pressed={selected}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left outline-none transition-colors focus-visible:bg-accent/60",
                          selected ? "bg-accent/70" : "hover:bg-accent/40",
                        )}
                      >
                        <meta.icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate font-mono text-[12.5px]",
                              selected ? "font-medium text-foreground" : "text-foreground/90",
                            )}
                          >
                            {a.fileName}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{meta.label}</span>
                        </span>
                        <AgentGlyph agent={a.createdBy} size="sm" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="flex min-h-[18rem] flex-col lg:min-h-[30rem]">
              {active && <ArtifactPreview key={active.id} artifact={active} />}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
