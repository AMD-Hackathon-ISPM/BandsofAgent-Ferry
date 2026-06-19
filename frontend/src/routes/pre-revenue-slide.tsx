import {
  IconArrowRight,
  IconBrandGithub,
  IconChecklist,
  IconCode,
  IconDatabase,
  IconGitPullRequest,
  IconReportAnalytics,
  IconShip,
  IconUsers,
} from "@tabler/icons-react"

const stages = [
  {
    label: "Repo intake",
    detail: "GitHub URL, branch, source language, target language",
    icon: IconBrandGithub,
  },
  {
    label: "Run simulation",
    detail: "9-agent Band room plans, analyzes, translates, tests",
    icon: IconShip,
  },
  {
    label: "Proof outputs",
    detail: "Target code, tests, DB SQL, risk report, PR draft",
    icon: IconGitPullRequest,
  },
]

const agents = [
  "Router",
  "Source Analyzer",
  "Business Logic",
  "Code Generator",
  "DB Migration",
  "Test Generator",
  "Reviewer",
  "Commander",
  "GitHub Connector",
]

const funnel = [
  { label: "Qualified legacy repos", value: 10, note: "COBOL / Java / PHP" },
  { label: "Paid pilots", value: 4, note: "40% conversion assumption" },
  { label: "PR-ready migrations", value: 2, note: "success-based upsell trigger" },
]

const bars = [
  { month: "M1", pilots: 4, revenue: "$10k", width: "38%" },
  { month: "M2", pilots: 7, revenue: "$17.5k", width: "62%" },
  { month: "M3", pilots: 12, revenue: "$30k", width: "100%" },
]

export default function PreRevenueSlide() {
  return (
    <main className="min-h-svh overflow-hidden bg-background text-foreground">
      <section className="mx-auto flex min-h-svh w-full items-center justify-center">
        <div className="relative aspect-video w-full max-w-[1280px] overflow-hidden border border-border bg-background shadow-2xl">
          <div className="absolute inset-y-0 right-0 w-[35%] bg-card/45" />

          <div className="relative z-10 grid h-full grid-cols-[1.08fr_0.92fr] gap-9 px-12 py-9">
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center bg-card">
                  <IconShip className="size-5 text-primary-bright" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.24em] text-primary-bright uppercase">
                    Ferry MVP Simulation
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    pre-revenue model / based on current repo scope
                  </p>
                </div>
              </div>

              <h1 className="mt-8 max-w-[710px] text-[52px] leading-[1] font-semibold tracking-normal text-balance">
                Turn one legacy repo run into the first paid modernization
                signal.
              </h1>

              <p className="mt-5 max-w-[650px] text-[18px] leading-7 text-muted-foreground">
                Ferry already has the MVP spine: GitHub intake, language/risk
                detection, multi-agent migration orchestration, generated
                artifacts, DB plan review, and PR creation.
              </p>

              <div className="mt-8 grid grid-cols-3 gap-6">
                {stages.map((stage, index) => {
                  const Icon = stage.icon
                  return (
                    <div
                      key={stage.label}
                      className="relative min-h-[112px] pr-2"
                    >
                      {index < stages.length - 1 && (
                        <IconArrowRight className="absolute top-2 -right-3 z-10 size-4 text-muted-foreground" />
                      )}
                      <span className="grid size-9 place-items-center bg-card text-primary-bright">
                        <Icon className="size-5" />
                      </span>
                      <p className="mt-4 text-[15px] font-semibold">
                        {stage.label}
                      </p>
                      <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                        {stage.detail}
                      </p>
                    </div>
                  )
                })}
              </div>

              <div className="mt-auto grid grid-cols-[0.8fr_1.2fr] gap-6 border-t border-border/80 pt-5">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                    MVP offer
                  </p>
                  <p className="mt-2 text-[15px] leading-6 text-foreground/85">
                    Paid pilot per repo, then expand through PR-ready delivery,
                    DB migration add-on, and implementation review.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-5">
                  <Metric
                    icon={<IconCode className="size-4" />}
                    value="3"
                    label="source routes"
                    note="COBOL, Java, PHP"
                  />
                  <Metric
                    icon={<IconUsers className="size-4" />}
                    value="9"
                    label="specialized agents"
                    note="Band-collab workflow"
                  />
                  <Metric
                    icon={<IconDatabase className="size-4" />}
                    value="1"
                    label="DB add-on"
                    note="MyISAM to InnoDB"
                  />
                </div>
              </div>
            </div>

            <aside className="flex min-w-0 flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.2em] text-primary-bright uppercase">
                    Pre-Revenue Forecast
                  </p>
                  <h2 className="mt-3 text-[30px] leading-tight font-semibold">
                    Simulate demand before scaling automation.
                  </h2>
                </div>
                <div className="bg-background/60 px-3 py-2 text-right">
                  <p className="font-mono text-[22px] font-semibold text-agent-codegen">
                    $2.5k
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    pilot price assumption
                  </p>
                </div>
              </div>

              <div className="mt-6 bg-background/55 p-5">
                <div className="grid grid-cols-3 gap-3">
                  {funnel.map((item) => (
                    <div key={item.label}>
                      <p className="font-mono text-[30px] leading-none font-semibold text-foreground">
                        {item.value}
                      </p>
                      <p className="mt-2 text-[12px] leading-4 font-medium text-foreground/85">
                        {item.label}
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                        {item.note}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 space-y-3">
                  {bars.map((bar) => (
                    <div key={bar.month} className="grid grid-cols-[34px_1fr_64px] items-center gap-3">
                      <p className="font-mono text-[12px] text-muted-foreground">
                        {bar.month}
                      </p>
                      <div className="h-2.5 bg-card">
                        <div
                          className="h-full bg-primary"
                          style={{ width: bar.width }}
                        />
                      </div>
                      <p className="text-right font-mono text-[13px] font-semibold text-foreground">
                        {bar.revenue}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <ProofPill icon={<IconChecklist />} label="Pilot success event" value="golden tests pass + reviewer approves" />
                <ProofPill icon={<IconReportAnalytics />} label="Sales artifact" value="risk report + migration report" />
              </div>

              <div className="mt-auto">
                <p className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Band room encoded in product
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-2">
                  {agents.map((agent, index) => (
                    <span key={agent} className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-agent-codegen">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {agent}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="mt-3 border-t border-border pt-2 text-[10px] leading-4 text-muted-foreground">
                  Forecast values are MVP planning assumptions; capabilities
                  reflect the current Ferry codebase and dummy run examples.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}

function Metric({
  icon,
  value,
  label,
  note,
}: {
  icon: React.ReactNode
  value: string
  label: string
  note: string
}) {
  return (
    <div className="min-h-[76px]">
      <div className="flex items-center gap-2 text-agent-codegen">
        {icon}
        <span className="font-mono text-[24px] leading-none font-semibold">
          {value}
        </span>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-foreground/85">
        {label}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">{note}</p>
    </div>
  )
}

function ProofPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactElement
  label: string
  value: string
}) {
  return (
    <div className="min-h-[64px] bg-background/50 p-3">
      <div className="flex items-center gap-2 text-primary-bright">
        {icon}
        <span className="text-[10px] font-semibold tracking-[0.12em] uppercase">
          {label}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
        {value}
      </p>
    </div>
  )
}
