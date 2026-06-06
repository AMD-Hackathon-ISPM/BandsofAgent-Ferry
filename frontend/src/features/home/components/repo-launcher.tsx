import * as React from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBrandGithub,
  IconCircleCheck,
  IconGitBranch,
} from "@tabler/icons-react"

import {
  SOURCE_LANGUAGE_LABEL,
  type SourceLanguage,
  type TargetLanguage,
} from "@/lib/domain"
import { resolveRepo, REPO_SUGGESTIONS, type ResolvedRepo } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
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
type Reason = "format" | "access" | "unsupported"

const ERROR_COPY: Record<Reason, string> = {
  format: "That does not look like a GitHub repository URL.",
  access: "We can't reach that repository with your GitHub access. Check the URL or your permissions.",
  unsupported: "Ferry migrates COBOL, Java, and PHP.",
}

export function RepoLauncher({ className }: { className?: string }) {
  const navigate = useNavigate()
  const [input, setInput] = React.useState("")
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [reason, setReason] = React.useState<Reason | null>(null)
  const [repo, setRepo] = React.useState<ResolvedRepo | null>(null)
  const [source, setSource] = React.useState<SourceLanguage>("cobol")
  const [target, setTarget] = React.useState<TargetLanguage>("go")
  const [dbEnabled, setDbEnabled] = React.useState(false)
  const seq = React.useRef(0)

  const run = React.useCallback(async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setPhase("idle")
      setReason(null)
      setRepo(null)
      return
    }
    const ticket = ++seq.current
    setPhase("validating")
    const result = await resolveRepo(trimmed)
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
    setRepo(result.repo)
    setSource(result.repo.detectedLanguage)
    setReason(null)
    setPhase("resolved")
  }, [])

  React.useEffect(() => {
    const id = window.setTimeout(() => run(input), 600)
    return () => window.clearTimeout(id)
  }, [input, run])

  const launch = () => {
    if (!repo) return
    toast.success("Migration launched", {
      description: `${repo.owner}/${repo.name} → ${target === "go" ? "Go" : "Rust"}. Assembling the band.`,
    })
    navigate("/runs/run_7")
  }

  const invalid = phase === "error"

  return (
    <section className={cn("border border-border bg-card", className)} aria-label="Start a migration">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Start a migration</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Point Ferry at a repository. The band reads it, rewrites it, and opens a pull request.
        </p>
      </div>

      <div className="p-4">
        <FieldGroup>
          <Field data-invalid={invalid || undefined}>
            <FieldLabel htmlFor="repo-url">Repository URL</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="repo-url"
                className="font-mono"
                placeholder="github.com/your-org/legacy-app"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={invalid || undefined}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") run(input)
                }}
              />
              <InputGroupAddon align="inline-end">
                {phase === "validating" && <Spinner className="text-muted-foreground" />}
                {phase === "resolved" && <IconCircleCheck className="size-4 text-success" />}
                {phase === "error" && <IconAlertTriangle className="size-4 text-destructive" />}
              </InputGroupAddon>
            </InputGroup>
            {phase === "error" && reason ? (
              <FieldError>
                {ERROR_COPY[reason]}
                {reason === "unsupported" && repo
                  ? ` This repo looks like ${repo.detectedLabel}.`
                  : ""}
              </FieldError>
            ) : (
              <FieldDescription>
                A private repo works once you are connected. Try{" "}
                {REPO_SUGGESTIONS.map((s, i) => (
                  <React.Fragment key={s}>
                    {i > 0 && ", "}
                    <button
                      type="button"
                      className="font-mono text-foreground underline-offset-2 outline-none hover:underline focus-visible:underline"
                      onClick={() => setInput(s)}
                    >
                      {s}
                    </button>
                  </React.Fragment>
                ))}
                .
              </FieldDescription>
            )}
          </Field>

          {phase === "resolved" && repo && (
            <div className="flex flex-col gap-4 border border-border bg-background p-3 stream-in">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs">
                  <IconBrandGithub className="size-3.5 text-muted-foreground" />
                  <span className="font-mono font-medium">
                    {repo.owner}/{repo.name}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                  <IconGitBranch className="size-3" />
                  {repo.defaultBranch}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="source-lang">Source</FieldLabel>
                  <Select value={source} onValueChange={(v) => setSource(v as SourceLanguage)}>
                    <SelectTrigger id="source-lang" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(["cobol", "java", "php"] as SourceLanguage[]).map((l) => (
                          <SelectItem key={l} value={l}>
                            {SOURCE_LANGUAGE_LABEL[l]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>Detected from the repository.</FieldDescription>
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
                  <span className="block font-medium">Include database migration</span>
                  <span className="block text-muted-foreground">MyISAM to InnoDB</span>
                </label>
                <Switch id="db-toggle" checked={dbEnabled} onCheckedChange={setDbEnabled} />
              </div>

              <Button onClick={launch} className="w-full">
                Launch migration
                <IconArrowRight data-icon="inline-end" />
              </Button>
            </div>
          )}
        </FieldGroup>
      </div>
    </section>
  )
}
