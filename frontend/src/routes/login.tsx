import { Navigate, useLocation } from "react-router-dom"
import { IconBrandGithub, IconLock } from "@tabler/icons-react"

import { AGENT_ORDER } from "@/lib/domain"
import { getRun } from "@/lib/mock/data"
import { phaseStates } from "@/lib/pipeline"
import { PHASES } from "@/lib/domain"
import { useAuth } from "@/providers/auth-provider"
import { AgentGlyph } from "@/features/migrations/components/agent"
import { Dot } from "@/features/migrations/components/status-dot"
import { Logo } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

function LoginPreview() {
  const run = getRun("run_7")!
  const states = phaseStates(run)
  const recent = run.messages.slice(-4)
  return (
    <div
      inert
      className="pointer-events-none relative hidden overflow-hidden border-l border-border bg-background bg-grid lg:flex lg:flex-col"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      <div className="relative m-auto w-full max-w-md p-8">
        <div className="border border-border bg-card/80 shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">Payroll Core</span>
              <span className="tabular text-muted-foreground">Run #7</span>
            </div>
            <span className="inline-flex items-center gap-1.5 border border-signal/25 bg-signal/12 px-1.5 py-0.5 text-[11px] text-signal">
              <Dot tone="live" pulse /> Testing
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-b border-border px-3 py-3">
            {PHASES.map((p, i) => {
              const s = states[i]
              return (
                <div key={p.key} className="flex flex-1 items-center gap-1.5">
                  <span
                    className={
                      "h-1.5 flex-1 " +
                      (s === "done"
                        ? "bg-success/60"
                        : s === "active"
                          ? "bg-signal"
                          : s === "skipped"
                            ? "bg-border"
                            : "bg-muted")
                    }
                  />
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-3 px-3 py-3">
            {recent.map((m) => (
              <div key={m.id} className="flex items-start gap-2.5">
                <AgentGlyph agent={m.agent} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] text-foreground/80">{m.summary}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 border-t border-border px-3 py-2.5">
            {AGENT_ORDER.map((a) => (
              <AgentGlyph key={a} agent={a} size="sm" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Login() {
  const { user, status, beginGitHub } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? "/"

  if (user) return <Navigate to={from} replace />

  const authenticating = status === "authenticating"

  const signIn = () => {
    beginGitHub()
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col justify-between p-6 sm:p-10">
        <Logo />

        <div className="mx-auto w-full max-w-sm py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Watch a band of agents rewrite your legacy code.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Ferry reads a COBOL, Java, or PHP repository, translates it to Go or Rust, plans the
            database move, writes the tests, and opens a pull request. You stay in control of every
            step.
          </p>

          <Button onClick={signIn} disabled={authenticating} size="lg" className="mt-7 w-full sm:w-auto">
            {authenticating ? (
              <>
                <Spinner data-icon="inline-start" />
                Opening GitHub
              </>
            ) : (
              <>
                <IconBrandGithub data-icon="inline-start" />
                Sign in with GitHub
              </>
            )}
          </Button>

          <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
            <IconLock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
            <span>
              Ferry reads your repositories and opens pull requests on your behalf. It never pushes to
              your default branch without a pull request.
            </span>
          </p>
        </div>

        <p className="text-xs text-muted-foreground/70">SINGKONG © 2026</p>
      </div>

      <LoginPreview />
    </div>
  )
}

export default Login
