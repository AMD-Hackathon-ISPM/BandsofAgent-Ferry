import { AGENTS, AGENT_ORDER, type AgentKey } from "@/lib/domain"
import { cn } from "@/lib/utils"
import { AgentGlyph } from "@/features/migrations/components/agent"
import { Reveal } from "./use-reveal"

/** Varied tile spans so the grid reads as a bento, not a uniform card wall. */
const SPAN: Partial<Record<AgentKey, string>> = {
  router: "sm:col-span-2 lg:row-span-2",
  commander: "sm:col-span-2",
}

/** A second line for the larger tiles, which have room to say more. */
const EXTRA: Partial<Record<AgentKey, string>> = {
  router:
    "The conductor of the band. It reads the whole repository, writes the migration plan, and hands each leg to the specialist who owns it, then waits for their work to come back.",
  commander:
    "Holds the final call. Nothing risky ships until the Commander has a human's approval on the record.",
}

function CrewTile({ agent, index }: { agent: AgentKey; index: number }) {
  const meta = AGENTS[agent]
  const extra = EXTRA[agent]
  return (
    <Reveal
      delay={(index % 4) * 70}
      className={cn("min-w-0", SPAN[agent])}
    >
      <div
        style={{ ["--hue" as string]: meta.color }}
        className="group flex h-full flex-col gap-3 border border-border bg-card/40 p-5 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_oklch,var(--hue)_45%,transparent)] hover:bg-card"
      >
        <AgentGlyph
          agent={agent}
          size="lg"
          className="transition-shadow duration-300 group-hover:shadow-[0_0_22px_color-mix(in_oklch,var(--hue)_45%,transparent)]"
        />
        <div className="mt-auto">
          <h3 className="text-sm font-semibold tracking-tight" style={{ color: meta.color }}>
            {meta.name}
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{meta.role}.</p>
          {extra && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground/80">{extra}</p>
          )}
        </div>
      </div>
    </Reveal>
  )
}

export function CrewBento() {
  return (
    <section id="crew" className="scroll-mt-16 border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
        <Reveal className="max-w-2xl">
          <h2 className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] pixel-heading text-balance">
            A band of nine, each with one job.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Ferry does not hand the whole migration to one model and hope. Nine specialized agents
            each own a single responsibility, talk to each other in the band room, and pass the
            work down the line.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-3 [grid-auto-flow:dense] sm:grid-cols-2 lg:grid-cols-4">
          {AGENT_ORDER.map((agent, i) => (
            <CrewTile key={agent} agent={agent} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
