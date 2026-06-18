import { Reveal } from "./use-reveal"

const PAINS = [
  {
    lead: "The people who wrote it are gone.",
    body: "The specification lives only in the source now. Forty years of payroll rules, tax tables, and exceptions, and no one left who can read all of it with confidence.",
  },
  {
    lead: "A rewrite means re-deriving behavior you can't fully see.",
    body: "Every edge case the old system quietly handles is a regression waiting to happen. Miss one and the first person to find it is a customer.",
  },
  {
    lead: "So the cutover keeps slipping.",
    body: "The mainframe stays on, the COBOL contractors stay expensive, and the risk compounds every year the migration sits on the roadmap instead of in a branch.",
  },
]

export function Problem() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-x-12 gap-y-10 px-4 py-24 sm:px-6 lg:grid-cols-[5fr_7fr]">
        <Reveal>
          <h2 className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] pixel-heading text-balance">
            Modernizing a core system is mostly fear, not typing.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
            The hard part was never writing Go. It is proving the new code does exactly what
            the old code did, on systems you cannot afford to get wrong.
          </p>
        </Reveal>

        <div role="list" className="border-t border-border">
          {PAINS.map((p, i) => (
            <Reveal
              key={p.lead}
              role="listitem"
              delay={i * 80}
              className="border-b border-border py-6"
            >
              <h3 className="text-lg font-semibold tracking-tight text-foreground">{p.lead}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {p.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
