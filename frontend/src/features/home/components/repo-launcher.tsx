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
type Reason = "format" | "access" | "unsupported" | "threshold"

const ERROR_COPY: Record<Reason, string> = {
  format: "That does not look like a GitHub repository URL.",
  access:
    "We can't reach that repository with your GitHub access. Check the URL or your permissions.",
  unsupported: "Ferry migrates COBOL, Java, and PHP.",
  threshold:
    "This repository is below the migration threshold and cannot be selected.",
}

const RISK_TONE: Record<MigrationRisk["level"], string> = {
  high: "border-success/30 bg-success/10 text-success",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-destructive/35 bg-destructive/10 text-destructive",
  blocked: "border-border bg-muted text-muted-foreground",
}

const RISK_DOT: Record<MigrationRisk["level"], string> = {
  high: "bg-success",
  medium: "bg-warning",
  low: "bg-destructive",
  blocked: "bg-muted-foreground",
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
  const pickerRef = React.useRef<HTMLDivElement>(null)
  const seq = React.useRef(0)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setSuggestionsLoading(true)
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

  const run = React.useCallback(
    async (value: string) => {
      const trimmed = value.trim()
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
    },
    [accessToken],
  )

  const repoOptions = React.useMemo(() => {
    const query = input.trim().toLowerCase()
    if (!query) return suggestions
    return suggestions.filter((repoOption) =>
      repoOption.fullName.toLowerCase().includes(query),
    )
  }, [input, suggestions])

  React.useEffect(() => {
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
    setInput(repoOption.fullName)
    setRepoMenuOpen(false)
    void run(repoOption.fullName)
  }

  const launch = async () => {
    if (!repo || !accessToken || launching) return
    setLaunching(true)
    try {
      const result = await createRun(accessToken, `${repo.owner}/${repo.name}`, branch, source, target, dbEnabled)
      toast.success("Migration launched", {
        description: `${repo.owner}/${repo.name}@${branch} → ${target === "go" ? "Go" : "Rust"}. Assembling the band.`,
      })
      navigate(`/runs/${result.id}`, { state: { justLaunched: true } })
    } catch (err) {
      toast.error("Failed to launch migration", {
        description: err instanceof Error ? err.message : "Something went wrong.",
      })
    } finally {
      setLaunching(false)
    }
  }

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
                  aria-label="GitHub repositories"
                  className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto border border-border bg-popover py-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
                >
                  <div className="px-2 py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground">
                    GitHub repositories
                  </div>
                  {suggestionsLoading ? (
                    <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                      <Spinner className="size-3.5" />
                      Loading repositories...
                    </div>
                  ) : repoOptions.length > 0 ? (
                    repoOptions.map((repoOption) => (
                      <button
                        key={repoOption.fullName}
                        type="button"
                        role="option"
                        aria-selected={input === repoOption.fullName}
                        aria-disabled={!repoOption.risk.selectable}
                        disabled={!repoOption.risk.selectable}
                        title={repoOption.risk.label}
                        className={cn(
                          "flex w-full items-center gap-2 px-2 py-2 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                          !repoOption.risk.selectable && "grayscale",
                        )}
                        onClick={() => selectRepo(repoOption)}
                      >
                        <IconBrandGithub className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                          {repoOption.fullName}
                        </span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 text-[10px] font-medium",
                            RISK_TONE[repoOption.risk.level],
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              RISK_DOT[repoOption.risk.level],
                            )}
                          />
                          {repoOption.detectedLabel || "Unknown"}{" "}
                          {repoOption.risk.percentage}%
                        </span>
                        {input === repoOption.fullName && (
                          <IconCircleCheck className="size-3.5 shrink-0 text-success" />
                        )}
                      </button>
                    ))
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
                  ? ` ${repo.detectedLabel} is ${repo.risk.percentage}%; minimum selectable threshold is above 40%.`
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

              <div
                className={cn(
                  "flex items-center justify-between gap-3 border px-3 py-2 text-xs",
                  RISK_TONE[repo.risk.level],
                )}
              >
                <span className="font-medium">{repo.risk.label}</span>
                <span className="font-mono">
                  {repo.risk.percentage}% {repo.detectedLabel}
                </span>
              </div>

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
                        {(["cobol", "java", "php"] as SourceLanguage[]).map(
                          (l) => (
                            <SelectItem key={l} value={l}>
                              {SOURCE_LANGUAGE_LABEL[l]}
                            </SelectItem>
                          )
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Detected from the repository.
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

              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <label htmlFor="db-toggle" className="text-xs">
                  <span className="block font-medium">
                    Include database migration
                  </span>
                  <span className="block text-muted-foreground">
                    MyISAM to InnoDB
                  </span>
                </label>
                <Switch
                  id="db-toggle"
                  checked={dbEnabled}
                  onCheckedChange={setDbEnabled}
                />
              </div>

              <Button onClick={launch} disabled={launching} className="w-full">
                {launching ? "Launching…" : "Launch migration"}
                <IconArrowRight data-icon="inline-end" />
              </Button>
            </div>
          )}
        </FieldGroup>
      </div>
    </section>
  )
}
