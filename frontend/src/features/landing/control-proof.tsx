import {
  IconArrowBackUp,
  IconChecklist,
  IconGitPullRequest,
  IconShieldCheck,
  IconTestPipe,
  type Icon,
} from "@tabler/icons-react"

import { Reveal } from "./use-reveal"

const GUARANTEES: { icon: Icon; title: string; body: string }[] = [
  {
    icon: IconShieldCheck,
    title: "High-risk steps wait for a human",
    body: "The database migration and the final merge pause for an approver. The Commander will not proceed on its own.",
  },
  {
    icon: IconTestPipe,
    title: "Tested against the original behavior",
    body: "Golden-case tests are lifted from the legacy regression fixtures, so a green run means the new code matches the old.",
  },
  {
    icon: IconArrowBackUp,
    title: "A rollback for every migration",
    body: "Each schema change ships with its down-migration and validation queries, written before the change ever runs.",
  },
  {
    icon: IconChecklist,
    title: "Every artifact is reviewed",
    body: "Nothing reaches the pull request until the Reviewer has checked it. No silent commits, no surprises in the diff.",
  },
]

export function ControlProof() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-28 sm:px-6 sm:py-36">
        <Reveal className="max-w-2xl">
          <h2 className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
            You stay in command of the crossing.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Agents do the work; you keep the controls. Ferry is built so the moments that matter
            for a core system are slow, visible, and reversible.
          </p>
        </Reveal>

        <Reveal
          delay={80}
          className="mt-10 flex items-start gap-3 border border-primary/30 bg-primary/8 p-5"
        >
          <IconGitPullRequest className="mt-0.5 size-5 shrink-0 text-primary-bright" />
          <p className="text-sm leading-relaxed text-foreground">
            <span className="font-semibold">Every change lands behind a pull request.</span>{" "}
            <span className="text-muted-foreground">
              It goes on a fresh branch, your default left untouched, until you choose to merge.
            </span>
          </p>
        </Reveal>

        <div role="list" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GUARANTEES.map((g, i) => (
            <Reveal
              key={g.title}
              role="listitem"
              delay={(i % 2) * 80}
              className="flex h-full items-start gap-3 border border-border bg-card/40 p-5"
            >
              <g.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">{g.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{g.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
