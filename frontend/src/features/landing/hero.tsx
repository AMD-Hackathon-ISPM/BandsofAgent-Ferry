import { IconArrowDown, IconLock } from "@tabler/icons-react"

import { getRun } from "@/lib/mock/data"
import { useMediaQuery } from "@/lib/hooks"
import { VoyageView } from "@/features/voyage/voyage-view"
import { Button } from "@/components/ui/button"
import { StartMigrationButton } from "./cta"

const EMPTY_IDS = new Set<string>()

export function Hero() {
  const run = getRun("run_7")!
  const isDesktop = useMediaQuery("(min-width: 1024px)")

  return (
    <section
      id="top"
      aria-label="Ferry: legacy code migration, ferried across to a modern shore"
      className="relative isolate min-h-svh overflow-hidden bg-background"
    >
      {/* Full-bleed voyage scene. Decorative: no pointer interaction, a still
          frame under reduced motion, no run-progress chrome (nothing to track
          yet). The ferry is biased to the right third so it stays clear of the
          copy on a full-width canvas. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <VoyageView
          run={run}
          messages={run.messages}
          streamedIds={EMPTY_IDS}
          showLog={false}
          showProgress={false}
          seaXFrac={isDesktop ? 0.76 : 0.66}
        />
      </div>

      {/* Readability scrim. Vertical on small screens (copy sits up top, sea
          shows below); horizontal on desktop (copy left, open sea right). */}
      <div
        aria-hidden="true"
        className="hero-readability-scrim absolute inset-0"
      />
      {/* Anchor the nav edge. */}
      <div
        aria-hidden="true"
        className="hero-nav-fade absolute inset-x-0 top-0 h-48"
      />
      {/* Full-width horizon fade into the next section. */}
      <div
        aria-hidden="true"
        className="hero-bottom-fade absolute inset-x-0 bottom-0 h-72"
      />

      <div className="relative mx-auto flex min-h-svh w-full max-w-6xl flex-col justify-center px-4 pt-28 pb-40 sm:px-6 lg:pb-32">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-tight text-primary-bright">
            COBOL · Java · PHP&nbsp;&nbsp;→&nbsp;&nbsp;Go · Rust
          </p>

          <h1 className="mt-5 text-[clamp(2.5rem,6vw,5.25rem)] leading-[0.98] font-semibold tracking-[-0.03em] text-balance text-foreground">
            Ferry your legacy code to a modern shore.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Ferry reads a legacy repository, translates it to Go or Rust, plans the database
            move, writes tests against the original behavior, and opens a pull request your
            team approves. You watch every leg of the crossing.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <StartMigrationButton size="lg" className="px-3.5" />
            <Button asChild size="lg" variant="outline" className="px-3.5">
              <a href="#demo">
                <IconArrowDown data-icon="inline-start" />
                Watch a run
              </a>
            </Button>
          </div>

          <p className="mt-7 flex items-center gap-2 text-xs text-muted-foreground/80">
            <IconLock className="size-3.5 shrink-0" />
            Never pushes to your default branch without a pull request.
          </p>
        </div>
      </div>
    </section>
  )
}
