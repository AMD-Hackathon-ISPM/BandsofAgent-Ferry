import { getRun } from "@/lib/mock/data"
import { useLiveRun, useNow } from "@/lib/hooks"
import { Dot } from "@/features/migrations/components/status-dot"
import { BandFeed } from "@/features/runs/components/band-feed"
import { VoyageView } from "@/features/voyage/voyage-view"
import { Reveal } from "./use-reveal"

export function LiveDemo() {
  const run = getRun("run_7")!
  const now = useNow(1000)
  const { messages, agents, streamedIds } = useLiveRun(run)
  const liveRun = { ...run, agents, messages }

  return (
    <section id="demo" className="scroll-mt-16 border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
        <Reveal className="max-w-2xl">
          <h2 className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] pixel-heading text-balance">
            Watch a real run, no account needed.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            This is the control room for a live migration of a COBOL payroll core to Go. The ferry
            is mid-crossing; the band room on the right is streaming as the agents work. Click the
            ship to look inside.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-12">
          <div className="overflow-hidden border border-border bg-card/40 shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <span className="font-medium text-foreground">payroll-core</span>
                <span className="tabular text-muted-foreground">run #{run.runNumber}</span>
                <span className="hidden font-mono text-[11px] text-muted-foreground/70 sm:inline">
                  {run.project.repoUrl}
                </span>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 border border-signal/25 bg-signal/10 px-1.5 py-0.5 text-[11px] text-signal">
                <Dot tone="live" pulse /> Live demo
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
              <div className="relative h-72 border-b border-border bg-[#15223f] sm:h-96 lg:border-r lg:border-b-0">
                <VoyageView
                  run={liveRun}
                  messages={messages}
                  streamedIds={streamedIds}
                  showLog={false}
                />
              </div>
              <div className="h-80 lg:h-96">
                <BandFeed
                  run={liveRun}
                  messages={messages}
                  streamedIds={streamedIds}
                  now={now}
                  className="h-full"
                />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
