import { Link } from "react-router-dom"
import { IconArrowUp } from "@tabler/icons-react"

import { Logo } from "@/components/brand"
import { StartMigrationButton } from "./cta"

type FooterLink = { label: string; href: string; internal?: boolean }

const PRODUCT: FooterLink[] = [
  { label: "The crossing", href: "#crossing" },
  { label: "The crew", href: "#crew" },
  { label: "What you get", href: "#artifacts" },
]

const START: FooterLink[] = [
  { label: "Watch a run", href: "#demo" },
  { label: "Sign in", href: "/login", internal: true },
]

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <h3 className="text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">
        {title}
      </h3>
      <ul className="mt-4 flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={link.label}>
            {link.internal ? (
              <Link
                to={link.href}
                className="text-sm text-foreground/80 transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ) : (
              <a
                href={link.href}
                className="text-sm text-foreground/80 transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid gap-x-8 gap-y-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr] lg:py-20">
          {/* Brand block */}
          <div className="max-w-xs">
            <Logo className="h-[22px]" />
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              Ferry reads a legacy repository and opens a reviewed pull request in Go or Rust.
              You watch every leg of the crossing.
            </p>
            <div className="mt-6">
              <StartMigrationButton size="sm" />
            </div>
          </div>

          <FooterColumn title="Product" links={PRODUCT} />
          <FooterColumn title="Get started" links={START} />
        </div>

        {/* Baseline */}
        <div className="flex flex-col gap-3 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Singkong. Legacy code, ferried to a modern shore.</p>
          <a
            href="#top"
            className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to top
            <IconArrowUp className="size-3.5" />
          </a>
        </div>
      </div>
    </footer>
  )
}
