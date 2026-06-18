import {
  IconChecklist,
  IconCode,
  IconDatabase,
  IconFileSearch,
  IconGitPullRequest,
  IconSitemap,
  IconTestPipe,
} from "@tabler/icons-react"

import { AGENTS, PHASES, type AgentKey, type PhaseKey } from "@/lib/domain"
import type { IconType } from "@/lib/domain"
import { cn } from "@/lib/utils"
import { Reveal } from "./use-reveal"

const PHASE_ICON: Record<PhaseKey, IconType> = {
  planning: IconSitemap,
  analysis: IconFileSearch,
  translation: IconCode,
  db_migration: IconDatabase,
  testing: IconTestPipe,
  review: IconChecklist,
  pr_generation: IconGitPullRequest,
}

/** Each leg is owned by a crew member, so it carries that agent's hue. */
const PHASE_AGENT: Record<PhaseKey, AgentKey> = {
  planning: "router",
  analysis: "source_analyzer",
  translation: "code_generator",
  db_migration: "db_migration",
  testing: "test_generator",
  review: "reviewer",
  pr_generation: "github_connector",
}

const PHASE_COPY: Record<PhaseKey, string> = {
  planning:
    "The Router reads the repository and lays out the route: which packages cross first, and which agent owns each piece of the work.",
  analysis:
    "The Source Analyzer maps the legacy structure while Business Logic lifts the rules buried in the paragraphs, so nothing implicit gets dropped.",
  translation:
    "The Code Generator writes the Go or Rust function by function, holding to the behavior of the original rather than guessing at intent.",
  db_migration:
    "DB Migration plans the MyISAM to InnoDB move with the lock window measured, a rollback written, and validation queries attached.",
  testing:
    "The Test Generator builds golden-case tests from the legacy regression fixtures and runs them against the new code until they match.",
  review:
    "The Reviewer checks every artifact, and the Commander holds the run at the risky steps until a human signs off.",
  pr_generation:
    "The GitHub Connector opens the pull request on a fresh branch: the diff, the tests, and the migration plan all in one place.",
}

function PhaseColor(key: PhaseKey) {
  return AGENTS[PHASE_AGENT[key]].color
}

export function Crossing() {
  return (
    <section id="crossing" className="scroll-mt-16 border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-28 sm:px-6 sm:py-36">
        <Reveal className="max-w-2xl">
          <h2 className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
            One crossing, seven legs.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            From legacy source to an open pull request, the band works the route in order. Each
            leg posts its findings, handoffs, and artifacts to the band room, the shared feed every
            agent reads.
          </p>
        </Reveal>

        {/* Route index — a glance at all seven nodes before the detail. */}
        <Reveal delay={80} className="mt-14 hidden md:block">
          <ol className="flex items-center">
            {PHASES.map((phase, i) => {
              const Icon = PHASE_ICON[phase.key]
              const color = PhaseColor(phase.key)
              return (
                <li key={phase.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    <span
                      className="flex size-11 items-center justify-center border"
                      style={{
                        color,
                        borderColor: `color-mix(in oklch, ${color} 40%, transparent)`,
                        backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
                      }}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {phase.short}
                    </span>
                  </div>
                  {i < PHASES.length - 1 && (
                    <span className="relative mx-2 h-px flex-1 overflow-hidden bg-border">
                      <span className="data-transfer absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-primary-bright to-transparent" />
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </Reveal>

        {/* The seven legs in order. The big numerals are the sequence. */}
        <div role="list" className="mt-12 border-t border-border md:mt-16">
          {PHASES.map((phase, i) => {
            const Icon = PHASE_ICON[phase.key]
            const color = PhaseColor(phase.key)
            return (
              <Reveal
                key={phase.key}
                role="listitem"
                delay={(i % 3) * 70}
                className="grid grid-cols-[auto_1fr] items-baseline gap-x-5 border-b border-border py-7 sm:gap-x-10"
              >
                <span
                  aria-hidden="true"
                  className="tabular font-mono text-2xl font-medium text-muted-foreground/40 sm:text-3xl"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn("flex size-7 items-center justify-center border")}
                      style={{
                        color,
                        borderColor: `color-mix(in oklch, ${color} 38%, transparent)`,
                        backgroundColor: `color-mix(in oklch, ${color} 13%, transparent)`,
                      }}
                    >
                      <Icon className="size-4" />
                    </span>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
                      {phase.label}
                    </h3>
                  </div>
                  <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {PHASE_COPY[phase.key]}
                  </p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
