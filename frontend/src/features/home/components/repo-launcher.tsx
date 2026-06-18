import * as React from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBrandGithub,
  IconChevronDown,
  IconCircleCheck,
  IconGitBranch,
} from "@tabler/icons-react"

import {
  SOURCE_LANGUAGE_LABEL,
  type SourceLanguage,
  type TargetLanguage,
} from "@/lib/domain"
import {
  createRun,
  fetchAppInstallation,
  fetchRepoSuggestions,
  resolveRepo,
  type MigrationRisk,
  type RepoSuggestion,
  type ResolvedRepo,
} from "@/lib/api"
import { useAuth } from "@/providers/auth-provider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Phase = "idle" | "validating" | "resolved" | "error"
type Reason = "format" | "access" | "unsupported" | "threshold" | "auth"

const ERROR_COPY: Record<Reason, string> = {
  format: "That does not look like a GitHub repository URL.",
  access:
    "We can't reach that repository with your GitHub access. Check the URL or your permissions.",
  unsupported: "Ferry migrates COBOL, Java, and PHP.",
  threshold:
    "This repository is below the migration threshold and cannot be selected.",
  auth: "Your session expired. Please sign in again.",
}

const RISK_TONE: Record<MigrationRisk["level"], string> = {
  high: "border-success/30 bg-success/10 text-success",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-destructive/35 bg-destructive/10 text-destructive",
  blocked: "border-border bg-muted text-muted-foreground",
}

const SUCCESS_LEVELS: Array<{
  level: Exclude<MigrationRisk["level"], "blocked">
  label: string
  range: string
}> = [
  { level: "high", label: "High", range: "80%+" },
  { level: "medium", label: "Medium", range: "41-79%" },
  { level: "low", label: "Low", range: "<=40%" },
]

const LANGUAGE_COLORS: Record<string, string> = {
  cobol: "#005ca5",
  css: "#563d7c",
  go: "#00add8",
  html: "#e34c26",
  java: "#b07219",
  javascript: "#f1e05a",
  jcl: "#d0aa22",
  php: "#4f5d95",
  plpgsql: "#336790",
  python: "#3572a5",
  rust: "#dea584",
  shell: "#89e051",
  sql: "#e38c00",
  typescript: "#3178c6",
}

const SOURCE_LANGUAGES: SourceLanguage[] = ["cobol", "java", "php"]

function safePercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function languageColor(language: string): string {
  return LANGUAGE_COLORS[language.toLowerCase()] ?? "var(--muted-foreground)"
}

function normalizeLanguageBreakdown(
  languages: Record<string, number> | undefined,
  fallbackLabel: string,
  fallbackPercentage: number
): Array<{ language: string; percentage: number }> {
  const rawLanguages = Object.entries(languages ?? {}).filter(
    ([, value]) => value > 0
  )
  const total = rawLanguages.reduce((sum, [, value]) => sum + value, 0)
  const valuesArePercentages =
    total <= 101 && rawLanguages.every(([, value]) => value <= 100)

  const normalizedLanguages = rawLanguages
    .map(([language, value]) => ({
      language,
      percentage: safePercent(
        valuesArePercentages ? value : (value / total) * 100
      ),
    }))
    .sort((a, b) => b.percentage - a.percentage)

  if (normalizedLanguages.length > 0) return normalizedLanguages
  return [
    {
      language: fallbackLabel,
      percentage: safePercent(fallbackPercentage),
    },
  ]
}

function languageBreakdown(
  repo: ResolvedRepo
): Array<{ language: string; percentage: number }> {
  return normalizeLanguageBreakdown(
    repo.languages,
    repo.detectedLabel,
    repo.risk.percentage
  )
}

function suggestionLanguageBreakdown(
  suggestion: RepoSuggestion
): Array<{ language: string; percentage: number }> {
  return normalizeLanguageBreakdown(
    suggestion.languages,
    suggestion.detectedLabel || "Unknown",
    suggestion.risk.percentage
  )
}

function sourceLanguageOptions(repo: ResolvedRepo): SourceLanguage[] {
  const present = new Set(
    languageBreakdown(repo).map(({ language }) => language.toLowerCase())
  )
  const options = SOURCE_LANGUAGES.filter((language) => present.has(language))
  if (options.length > 0) return options
  return repo.detectedLanguage === "unsupported" ? [] : [repo.detectedLanguage]
}

function detectedLanguagePercent(repo: ResolvedRepo): number {
  const detected = languageBreakdown(repo).find(
    ({ language }) =>
      language.toLowerCase() === repo.detectedLabel.toLowerCase()
  )
  return detected?.percentage ?? safePercent(repo.risk.percentage)
}

function LanguageProfile({
  repo,
}: {
  repo: ResolvedRepo
}) {
  const breakdown = languageBreakdown(repo)
  const dominant = breakdown[0]

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Language profile
          </div>
          {dominant && (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm font-semibold text-foreground">
                {dominant.language}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {dominant.percentage}%
              </span>
            </div>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold shadow-[0_0_0_1px_color-mix(in_oklch,currentColor_12%,transparent)]",
            RISK_TONE[repo.risk.level]
          )}
        >
          {repo.risk.label}
        </span>
      </div>

      <div className="mb-4 flex h-2 overflow-hidden border border-border/70 bg-muted/50">
        {breakdown.map(({ language, percentage }) => {
          const color = languageColor(language)
          return (
            <div
              key={language}
              className="h-full min-w-1"
              style={{
                width: `${percentage}%`,
                backgroundColor: color,
              }}
              title={`${language} ${percentage}%`}
            />
          )
        })}
      </div>

      <div className="grid gap-2">
        {breakdown.map(({ language, percentage }) => {
          const color = languageColor(language)
          return (
            <div
              key={language}
              className="group border border-border/70 bg-background/50 px-2.5 py-2 transition-colors hover:border-foreground/20 hover:bg-muted/30"
            >
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground">
                  <span
                    className="size-2.5 shrink-0 border border-background/40 shadow-[0_0_0_2px_color-mix(in_oklch,currentColor_18%,transparent)]"
                    style={{
                      backgroundColor: color,
                      color,
                    }}
                  />
                  <span className="truncate">{language}</span>
                </span>
                <span className="font-mono text-muted-foreground">
                  {percentage}%
                </span>
              </div>
              <div className="h-1 overflow-hidden bg-muted">
                <div
                  className="h-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: color,
                    boxShadow: `0 0 18px color-mix(in oklch, ${color} 35%, transparent)`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SuccessProbabilityCards({ level }: { level: MigrationRisk["level"] }) {
  const activeLevel = level === "blocked" ? "low" : level

  return (
    <div className="grid grid-cols-3 gap-2">
      {SUCCESS_LEVELS.map((item) => {
        const active = item.level === activeLevel
        return (
          <div
            key={item.level}
            className={cn(
              "flex min-h-14 flex-col justify-between border px-2 py-1.5",
              active
                ? RISK_TONE[item.level]
                : "border-border bg-card text-muted-foreground"
            )}
            aria-current={active ? "true" : undefined}
          >
            <span className="text-xs font-semibold">{item.label}</span>
            <span className="font-mono text-[10px]">{item.range}</span>
          </div>
        )
      })}
    </div>
  )
}

export function RepoLauncher({ className }: { className?: string }) {
  const navigate = useNavigate()
  const { accessToken } = useAuth()
  const [input, setInput] = React.useState("")
  const [repoMenuOpen, setRepoMenuOpen] = React.useState(false)
  const [suggestions, setSuggestions] = React.useState<RepoSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = React.useState(false)
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [reason, setReason] = React.useState<Reason | null>(null)
  const [repo, setRepo] = React.useState<ResolvedRepo | null>(null)
  const [branch, setBranch] = React.useState("main")
  const [source, setSource] = React.useState<SourceLanguage>("cobol")
  const [target, setTarget] = React.useState<TargetLanguage>("go")
  const [dbEnabled, setDbEnabled] = React.useState(false)
  const [launching, setLaunching] = React.useState(false)
  const [installState, setInstallState] = React.useState<
    "idle" | "checking" | "installed" | "needed"
  >("idle")
  const [installUrl, setInstallUrl] = React.useState("")
  const pickerRef = React.useRef<HTMLDivElement>(null)
  const seq = React.useRef(0)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setSuggestionsLoading(true)
    })
    fetchRepoSuggestions(accessToken)
      .then((repos) => {
        if (!cancelled) setSuggestions(repos)
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accessToken])

  // Check whether the Ferry GitHub App is installed on a repo (so it can push).
  // Called from event handlers (resolve, re-check, focus), never synchronously
  // inside an effect.
  const loadInstall = React.useCallback(
    (target: ResolvedRepo) => {
      if (!accessToken) return
      setInstallState("checking")
      fetchAppInstallation(accessToken, `${target.owner}/${target.name}`)
        .then((res) => {
          setInstallState(res.installed ? "installed" : "needed")
          setInstallUrl(res.installUrl)
        })
        .catch(() => setInstallState("installed"))
    },
    [accessToken]
  )

  const run = React.useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      setInstallState("idle")
      if (!trimmed) {
        setPhase("idle")
        setReason(null)
        setRepo(null)
        setBranch("main")
        return
      }
      const ticket = ++seq.current
      setPhase("validating")
      const result = await resolveRepo(trimmed, accessToken ?? "")
      if (ticket !== seq.current) return
      if (!result.ok) {
        setReason(result.reason)
        setRepo(null)
        setPhase("error")
        return
      }
      if (result.repo.detectedLanguage === "unsupported") {
        setReason("unsupported")
        setRepo(result.repo)
        setPhase("error")
        return
      }
      if (!result.repo.risk.selectable) {
        setReason("threshold")
        setRepo(result.repo)
        setPhase("error")
        return
      }
      setRepo(result.repo)
      setBranch(result.repo.defaultBranch)
      setSource(result.repo.detectedLanguage)
      setReason(null)
      setPhase("resolved")
      loadInstall(result.repo)
    },
    [accessToken, loadInstall]
  )

  const repoOptions = React.useMemo(() => {
    const query = input.trim().toLowerCase()
    if (!query) return suggestions
    return suggestions.filter((repoOption) =>
      repoOption.fullName.toLowerCase().includes(query)
    )
  }, [input, suggestions])

  React.useEffect(() => {
    if (!input.trim()) return
    const id = window.setTimeout(() => run(input), 600)
    return () => window.clearTimeout(id)
  }, [input, run])

  React.useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setRepoMenuOpen(false)
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick)
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick)
  }, [])

  const selectRepo = (repoOption: RepoSuggestion) => {
    if (!repoOption.risk.selectable) return
    setInput("")
    setRepoMenuOpen(false)
    void run(repoOption.fullName)
  }

  const launch = async () => {
    if (!repo || !accessToken || launching || installState === "needed") return
    setLaunching(true)
    try {
      const result = await createRun(
        accessToken,
        `${repo.owner}/${repo.name}`,
        branch,
        source,
        target,
        dbAvailable && dbEnabled
      )
      toast.success("Migration launched", {
        description: `${repo.owner}/${repo.name}@${branch} → ${target === "go" ? "Go" : "Rust"}. Assembling the band.`,
      })
      navigate(`/runs/${result.id}`, { state: { justLaunched: true } })
    } catch (err) {
      toast.error("Failed to launch migration", {
        description:
          err instanceof Error ? err.message : "Something went wrong.",
      })
    } finally {
      setLaunching(false)
    }
  }

  // After the user installs in the GitHub tab and returns, re-check on focus.
  React.useEffect(() => {
    if (installState !== "needed" || !repo) return
    const onFocus = () => loadInstall(repo)
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [installState, repo, loadInstall])

  const dbAvailable = repo?.dbMigration?.available ?? true
  const dbLabel = repo?.dbMigration?.label ?? "MyISAM to InnoDB"
  const selectedRepoFullName = repo ? `${repo.owner}/${repo.name}` : ""
  const sourceOptions = repo ? sourceLanguageOptions(repo) : SOURCE_LANGUAGES

  const invalid = phase === "error"

  return (
    <section
      className={cn("border border-border bg-card", className)}
      aria-label="Start a migration"
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Start a migration</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Point Ferry at a repository. The band reads it, rewrites it, and opens
          a pull request.
        </p>
      </div>

      <div className="p-4">
        <FieldGroup>
          <Field data-invalid={invalid || undefined}>
            <FieldLabel htmlFor="repo-url">Repository URL</FieldLabel>
            <div ref={pickerRef} className="relative">
              <InputGroup>
                <InputGroupInput
                  id="repo-url"
                  className="font-mono"
                  placeholder="Select or enter a repository URL..."
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-expanded={repoMenuOpen}
                  aria-haspopup="listbox"
                  aria-invalid={invalid || undefined}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    setRepoMenuOpen(true)
                  }}
                  onFocus={() => setRepoMenuOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setRepoMenuOpen(false)
                      void run(input)
                    }
                    if (e.key === "Escape") setRepoMenuOpen(false)
                  }}
                />
                <InputGroupAddon align="inline-end" className="gap-1">
                  {phase === "validating" && (
                    <Spinner className="text-muted-foreground" />
                  )}
                  {phase === "resolved" && (
                    <IconCircleCheck className="size-4 text-success" />
                  )}
                  {phase === "error" && (
                    <IconAlertTriangle className="size-4 text-destructive" />
                  )}
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Show repositories"
                    aria-expanded={repoMenuOpen}
                    onClick={() => setRepoMenuOpen((open) => !open)}
                  >
                    <IconChevronDown
                      className={cn(
                        "transition-transform",
                        repoMenuOpen && "rotate-180"
                      )}
                    />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>

              {repoMenuOpen && (
                <div
                  role="listbox"
                  aria-label="Your GitHub Repositories"
                  className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto border border-border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
                >
                  <div className="px-2 py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground">
                    Your GitHub Repositories
                  </div>
                  {suggestionsLoading ? (
                    <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                      <Spinner className="size-3.5" />
                      Loading repositories...
                    </div>
                  ) : repoOptions.length > 0 ? (
                    repoOptions.map((repoOption) => {
                      const languageBadges = suggestionLanguageBreakdown(
                        repoOption
                      ).filter(({ language }) =>
                        SOURCE_LANGUAGES.includes(
                          language.toLowerCase() as SourceLanguage
                        )
                      )
                      const selected =
                        selectedRepoFullName === repoOption.fullName
                      return (
                        <button
                          key={repoOption.fullName}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          aria-disabled={!repoOption.risk.selectable}
                          disabled={!repoOption.risk.selectable}
                          title={repoOption.risk.label}
                          className={cn(
                            "flex w-full items-center gap-2 px-2 py-2 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                            !repoOption.risk.selectable && "grayscale"
                          )}
                          onClick={() => selectRepo(repoOption)}
                        >
                          <IconBrandGithub className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                            {repoOption.fullName}
                          </span>
                          <span className="hidden shrink-0 items-center gap-1 sm:inline-flex">
                            {languageBadges.map(({ language, percentage }) => {
                              const color = languageColor(language)
                              return (
                                <span
                                  key={language}
                                  className="inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{
                                    borderColor: `color-mix(in oklch, ${color} 42%, var(--border))`,
                                    backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
                                    color,
                                  }}
                                >
                                  <span
                                    className="size-1.5 rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                  {language} {percentage}%
                                </span>
                              )
                            })}
                          </span>
                          {repoOption.risk.level !== "blocked" && (
                            <span
                              className={cn(
                                "hidden shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold sm:inline-flex",
                                RISK_TONE[repoOption.risk.level]
                              )}
                            >
                              {repoOption.risk.level === "high"
                                ? "High"
                                : repoOption.risk.level === "medium"
                                  ? "Medium"
                                  : "Low"}
                            </span>
                          )}
                          {selected && (
                            <IconCircleCheck className="size-3.5 shrink-0 text-success" />
                          )}
                        </button>
                      )
                    })
                  ) : (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      {input.trim()
                        ? "Press Enter to use this repository URL."
                        : "No Java, COBOL, or PHP repositories found."}
                    </div>
                  )}
                </div>
              )}
            </div>
            {phase === "error" && reason && (
              <FieldError>
                {ERROR_COPY[reason]}
                {reason === "unsupported" && repo
                  ? ` This repo looks like ${repo.detectedLabel}.`
                  : ""}
                {reason === "threshold" && repo
                  ? ` ${repo.detectedLabel} is ${detectedLanguagePercent(repo)}%; minimum selectable threshold is above 40%.`
                  : ""}
              </FieldError>
            )}
          </Field>

          {phase === "resolved" && repo && (
            <div className="stream-in flex flex-col gap-4 border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs">
                  <IconBrandGithub className="size-3.5 text-muted-foreground" />
                  <span className="font-mono font-medium">
                    {repo.owner}/{repo.name}
                  </span>
                </span>
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger size="sm" className="max-w-40 font-mono">
                    <IconGitBranch className="size-3 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectGroup>
                      {repo.branches.map((branchName) => (
                        <SelectItem
                          key={branchName}
                          value={branchName}
                          className="font-mono"
                        >
                          {branchName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 border border-border bg-card p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] md:grid-cols-[minmax(0,1fr)_minmax(220px,0.78fr)]">
                <LanguageProfile repo={repo} />
                <div>
                  <div className="mb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Success probability
                  </div>
                  <SuccessProbabilityCards level={repo.risk.level} />
                </div>
              </div>

              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Language migration
              </span>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="source-lang">Source</FieldLabel>
                  <Select
                    value={source}
                    onValueChange={(v) => setSource(v as SourceLanguage)}
                  >
                    <SelectTrigger id="source-lang" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sourceOptions.map((l) => (
                          <SelectItem key={l} value={l}>
                            {SOURCE_LANGUAGE_LABEL[l]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Only languages found in this repository.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>Translate to</FieldLabel>
                  <ToggleGroup
                    type="single"
                    value={target}
                    onValueChange={(v) => v && setTarget(v as TargetLanguage)}
                    variant="outline"
                    className="w-full"
                  >
                    <ToggleGroupItem value="go" className="flex-1">
                      Go
                    </ToggleGroupItem>
                    <ToggleGroupItem value="rust" className="flex-1">
                      Rust
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>The target language.</FieldDescription>
                </Field>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Database migration
                </span>
                <div
                  className={cn(
                    "flex items-center justify-between gap-3",
                    !dbAvailable && "opacity-50"
                  )}
                >
                  <label htmlFor="db-toggle" className="text-xs">
                    <span className="block font-medium">
                      Include database migration
                    </span>
                    <span className="block text-muted-foreground">
                      {dbLabel}
                    </span>
                  </label>
                  <Switch
                    id="db-toggle"
                    checked={dbAvailable && dbEnabled}
                    onCheckedChange={setDbEnabled}
                    disabled={!dbAvailable}
                  />
                </div>
              </div>

              {installState === "needed" ? (
                <div className="flex flex-col gap-2 border border-warning/35 bg-warning/10 p-3">
                  <p className="text-xs text-warning">
                    Ferry needs write access to open the pull request. Install
                    the Ferry GitHub App on{" "}
                    <span className="font-mono">
                      {repo.owner}/{repo.name}
                    </span>
                    , then re-check.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button asChild className="flex-1" disabled={!installUrl}>
                      <a href={installUrl} target="_blank" rel="noreferrer">
                        <IconBrandGithub data-icon="inline-start" />
                        Install Ferry on this repo
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => repo && loadInstall(repo)}
                    >
                      Re-check
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={launch}
                  disabled={launching || installState === "checking"}
                  className="w-full"
                >
                  {launching
                    ? "Launching…"
                    : installState === "checking"
                      ? "Checking access…"
                      : "Launch migration"}
                  <IconArrowRight data-icon="inline-end" />
                </Button>
              )}
            </div>
          )}
        </FieldGroup>
      </div>
    </section>
  )
}
