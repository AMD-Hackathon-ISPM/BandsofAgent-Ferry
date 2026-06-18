import * as React from "react"
import { Link } from "react-router-dom"

import { useAuth } from "@/providers/auth-provider"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { StartMigrationButton } from "./cta"

const SECTIONS = [
  { href: "#crossing", label: "The crossing" },
  { href: "#crew", label: "The crew" },
  { href: "#artifacts", label: "What you get" },
] as const

export function LandingNav() {
  const { user } = useAuth()
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-colors duration-300",
        scrolled
          ? "border-b border-border bg-background/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a
          href="#top"
          className="rounded-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Ferry, back to top"
        >
          <Logo className="h-[19px]" />
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {!user && (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
          <StartMigrationButton size="sm" />
        </div>
      </div>
    </header>
  )
}
