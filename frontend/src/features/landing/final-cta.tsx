import { IconLock } from "@tabler/icons-react"

import { Reveal } from "./use-reveal"
import { StartMigrationButton } from "./cta"

export function FinalCta() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <div className="relative isolate overflow-hidden border border-border bg-card/20 px-6 py-24 text-center sm:px-10 sm:py-32">
            {/* Concentric dither ripple, framing the edges, clear in the center. */}
            <div aria-hidden="true" className="dither-ripple pointer-events-none absolute inset-0" />
            {/* Soft brand glow behind the text. */}
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]"
            />

            <div className="relative mx-auto flex max-w-2xl flex-col items-center">
              <h2 className="text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.02] pixel-heading text-balance">
                Moor your legacy code at the modern shore.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Point Ferry at a COBOL, Java, or PHP repository and watch the band carry it across
                to Go or Rust, tests and pull request included.
              </p>

              <div className="mt-9">
                <StartMigrationButton size="lg" className="px-4" />
              </div>

              <p className="mt-7 flex items-center gap-2 text-xs text-muted-foreground/80">
                <IconLock className="size-3.5 shrink-0" />
                Connects through GitHub. Reads your repos, opens pull requests, nothing more.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
