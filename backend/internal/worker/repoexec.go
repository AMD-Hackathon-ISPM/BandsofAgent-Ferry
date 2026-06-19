package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/sandbox"
)

const (
	maxStageAssistRounds = 4
	maxRepoExecCommands  = 4
	maxZeroFileRetries   = 2
	repoExecTimeout      = 90 * time.Second
	repoExecImage        = "alpine:3.20"
)

var repoExecRe = regexp.MustCompile(`(?s)\[ferry-repoexec\]\s*(.*?)\s*\[/ferry-repoexec\]`)

var allowedRepoExec = map[string]bool{
	"pwd":  true,
	"ls":   true,
	"find": true,
	"grep": true,
	"rg":   true,
	"cat":  true,
	"sed":  true,
	"head": true,
	"tail": true,
	"wc":   true,
	"git":  true,
}

var allowedGitSubcommands = map[string]bool{
	"status":    true,
	"branch":    true,
	"log":       true,
	"show":      true,
	"ls-files":  true,
	"rev-parse": true,
}

type repoExecRequest struct {
	Commands []repoExecCommand `json:"commands"`
}

type repoExecCommand struct {
	Args []string `json:"args"`
}

func (w *Worker) completeStage(ctx context.Context, runCtx band.RunCtx, prompt string) (string, error) {
	if err := w.ensureGeneratedFilesBeforeVerdict(ctx, runCtx.Run); err != nil {
		return "", terminalStageError{err: err}
	}

	attempts := 1
	if w.role.producesFiles {
		attempts += maxZeroFileRetries
	}

	var output string
	for attempt := 0; attempt < attempts; attempt++ {
		stagePrompt := prompt
		forceAnswer := false
		if attempt > 0 {
			stagePrompt = zeroFileRetryPrompt(prompt)
			forceAnswer = true
		}

		res, err := w.completeStageOnce(ctx, runCtx, stagePrompt, forceAnswer)
		if err != nil {
			return "", err
		}
		w.logCompletion(runCtx, attempt+1, res)
		output = res.Text

		if !w.role.producesFiles || len(extractFiles(output)) > 0 {
			return output, nil
		}
		log.Printf("[%s] zero generated files extracted for run %s on attempt %d", w.info.Key, runCtx.Run, attempt+1)
	}

	return "", terminalStageError{err: fmt.Errorf("%s produced no files after %d attempts; expected fenced // file: <path> blocks", w.info.Key, attempts)}
}

func (w *Worker) completeStageOnce(ctx context.Context, runCtx band.RunCtx, prompt string, forceAnswer bool) (completionResult, error) {
	base, key, model := w.resolveLLM(runCtx.Tgt, runCtx.Slot)
	lim := w.limiterForSlot(runCtx.Slot)

	allowRepoExec := !forceAnswer && w.canUseRepoExec(runCtx)
	allowConsult := !forceAnswer && w.canUseConsult(runCtx)
	if !allowRepoExec && !allowConsult {
		return w.llm.Complete(ctx, base, key, model, lim, w.role.system, prompt)
	}

	history := make([]string, 0, maxStageAssistRounds)
	for round := 0; round < maxStageAssistRounds; round++ {
		fullPrompt := w.assistPrompt(prompt, history, allowRepoExec, allowConsult, round == maxStageAssistRounds-1)
		output, err := w.llm.Complete(ctx, base, key, model, lim, w.role.system, fullPrompt)
		if err != nil {
			return completionResult{}, err
		}

		repoReq, repoPresent, repoErr := parseRepoExecRequest(output.Text)
		consultReq, consultPresent, consultErr := parseConsultRequest(output.Text)
		switch {
		case repoPresent && consultPresent:
			history = append(history, "ASSIST REQUEST ERROR:\nrequest either ferry-repoexec or ferry-consult, not both in one reply")
			continue
		case consultPresent:
			if consultErr != nil {
				history = append(history, "CONSULT REQUEST ERROR:\n"+consultErr.Error())
				continue
			}
			result, runErr := w.runConsult(ctx, runCtx, consultReq)
			if runErr != nil {
				history = append(history, "CONSULT FAILURE:\n"+runErr.Error())
				continue
			}
			history = append(history, result)
			continue
		case repoPresent:
			if repoErr != nil {
				history = append(history, "REPOSITORY INSPECTION REQUEST ERROR:\n"+repoErr.Error())
				continue
			}
			result, runErr := w.runRepoExec(ctx, runCtx, repoReq)
			if runErr != nil {
				history = append(history, "REPOSITORY INSPECTION FAILURE:\n"+runErr.Error())
				continue
			}
			history = append(history, result)
			continue
		default:
			return output, nil
		}
	}

	finalPrompt := w.assistPrompt(prompt, history, allowRepoExec, allowConsult, true) + "\n\nASSIST LIMIT REACHED. Do not request more repo commands or consultations. Produce your best answer now."
	return w.llm.Complete(ctx, base, key, model, lim, w.role.system, finalPrompt)
}

func (w *Worker) ensureGeneratedFilesBeforeVerdict(ctx context.Context, runID string) error {
	if w.info.Key != "reviewer" && w.info.Key != "commander" {
		return nil
	}
	if len(w.loadFiles(ctx, runID)) == 0 {
		return fmt.Errorf("%s cannot run: no generated files in %s", w.info.Key, filesKey(runID))
	}
	return nil
}

func zeroFileRetryPrompt(prompt string) string {
	return prompt + "\n\n---\n\nZERO-FILE CORRECTION:\nYour previous response did not contain any parseable generated files. You must re-emit fenced `// file: <path>` blocks now. Every generated file must be in a fenced code block whose first line is `// file: <path>`. Do not explain, do not request repository commands, and do not hand off until the file blocks are present."
}

func (w *Worker) logCompletion(runCtx band.RunCtx, attempt int, res completionResult) {
	if w.info.Key != "code_generator" {
		return
	}
	usage := "usage=unknown"
	if res.Usage != nil {
		usage = fmt.Sprintf("prompt_tokens=%d completion_tokens=%d total_tokens=%d", res.Usage.PromptTokens, res.Usage.CompletionTokens, res.Usage.TotalTokens)
	}
	log.Printf("[%s] completion diagnostics run=%s attempt=%d prompt_bytes=%d output_bytes=%d finish_reason=%q %s", w.info.Key, runCtx.Run, attempt, res.PromptBytes, res.OutputBytes, res.FinishReason, usage)
}

func (w *Worker) canUseRepoExec(runCtx band.RunCtx) bool {
	return w.execEnabled && w.role.needsSource && runCtx.Repo != "" && runCtx.Run != ""
}

func (w *Worker) canUseConsult(runCtx band.RunCtx) bool {
	return runCtx.Run != "" && w.resolveAnyLLM != nil
}

func (w *Worker) assistPrompt(base string, history []string, allowRepoExec, allowConsult, forceAnswer bool) string {
	var b strings.Builder
	b.WriteString(base)
	b.WriteString("\n\n---\n\n")
	b.WriteString("STAGE ASSIST:\n")
	if allowRepoExec {
		b.WriteString("- You can inspect the real repository checkout in a sandbox workspace before answering.\n")
		if len(history) == 0 && !forceAnswer {
			b.WriteString("- Before answering this stage, inspect the real repository at least once with ferry-repoexec unless the answer is already obvious from the provided context.\n")
		} else {
			b.WriteString("- For content-heavy or large repos, inspect the repo instead of relying only on the digest.\n")
		}
		b.WriteString("- To request inspection, reply with ONLY one [ferry-repoexec]...[/ferry-repoexec] block.\n")
		b.WriteString("- JSON format: {\"commands\":[{\"args\":[\"find\",\".\",\"-maxdepth\",\"2\",\"-type\",\"f\"]},{\"args\":[\"sed\",\"-n\",\"1,160p\",\"path/to/file\"]}]}\n")
		b.WriteString("- Commands run from the repository root after the worker prepares a shallow clone.\n")
		b.WriteString("- Allowed executables: pwd, ls, find, grep, rg, cat, sed, head, tail, wc, git.\n")
		b.WriteString("- Allowed git subcommands: status, branch, log, show, ls-files, rev-parse.\n")
		b.WriteString("- Read-only only. Do not request shells, interpreters, package managers, networking tools, env inspection, or path traversal.\n")
		b.WriteString("- Use at most 4 commands per request.\n")
	}
	if allowConsult {
		b.WriteString("- You can ask another Ferry specialist model a side question while staying in the current pipeline stage.\n")
		b.WriteString("- To do that, reply with ONLY one [ferry-consult]...[/ferry-consult] block.\n")
		b.WriteString("- JSON format: {\"agent\":\"db_migration\",\"question\":\"...\",\"context\":\"optional short context for the consulted agent\"}\n")
		b.WriteString("- Consultable agents: source_analyzer, business_logic, code_generator, db_migration, test_generator, reviewer, commander.\n")
		b.WriteString("- Use consultation for targeted specialist advice, not for delegating your whole stage.\n")
	}
	b.WriteString("- When you have enough information, answer normally and do not emit ferry-repoexec or ferry-consult.\n")
	if forceAnswer {
		b.WriteString("- You must answer now; do not request more commands or consultations.\n")
	}
	if len(history) > 0 {
		b.WriteString("\nASSIST RESULTS:\n\n")
		b.WriteString(strings.Join(history, "\n\n---\n\n"))
	}
	return b.String()
}

func parseRepoExecRequest(content string) (repoExecRequest, bool, error) {
	m := repoExecRe.FindStringSubmatch(content)
	if m == nil {
		return repoExecRequest{}, false, nil
	}
	var req repoExecRequest
	if err := json.Unmarshal([]byte(strings.TrimSpace(m[1])), &req); err != nil {
		return repoExecRequest{}, true, fmt.Errorf("invalid ferry-repoexec JSON: %w", err)
	}
	if err := validateRepoExecRequest(req); err != nil {
		return repoExecRequest{}, true, err
	}
	return req, true, nil
}

func validateRepoExecRequest(req repoExecRequest) error {
	if len(req.Commands) == 0 {
		return fmt.Errorf("ferry-repoexec requires at least one command")
	}
	if len(req.Commands) > maxRepoExecCommands {
		return fmt.Errorf("ferry-repoexec allows at most %d commands", maxRepoExecCommands)
	}
	for i, cmd := range req.Commands {
		if len(cmd.Args) == 0 {
			return fmt.Errorf("command %d is empty", i+1)
		}
		name := cmd.Args[0]
		if !allowedRepoExec[name] {
			return fmt.Errorf("command %q is not allowed", name)
		}
		if name == "git" {
			if len(cmd.Args) < 2 || !allowedGitSubcommands[cmd.Args[1]] {
				return fmt.Errorf("git subcommand %q is not allowed", strings.Join(cmd.Args[1:], " "))
			}
		}
		for _, arg := range cmd.Args[1:] {
			if len(arg) > 200 {
				return fmt.Errorf("argument too long in command %q", name)
			}
			if strings.HasPrefix(arg, "/") || strings.Contains(arg, "..") {
				return fmt.Errorf("absolute or parent paths are not allowed: %q", arg)
			}
			if strings.ContainsAny(arg, "\x00\r\n") {
				return fmt.Errorf("invalid control characters in argument %q", arg)
			}
		}
	}
	return nil
}

func (w *Worker) runRepoExec(ctx context.Context, runCtx band.RunCtx, req repoExecRequest) (string, error) {
	owner, name, ok := splitRepo(runCtx.Repo)
	if !ok {
		return "", fmt.Errorf("invalid repo %q", runCtx.Repo)
	}

	spec := sandbox.Spec{
		Image:   repoExecImage,
		Script:  w.repoExecScript(ctx, runCtx, owner, name, req),
		Timeout: repoExecTimeout,
		RunID:   runCtx.Run,
	}
	res, err := sandbox.Execute(ctx, w.runnerURL, spec)
	if err != nil {
		return "", err
	}

	status := "ok"
	if res.TimedOut {
		status = "timeout"
	} else if res.ExitCode != 0 {
		status = fmt.Sprintf("exit %d", res.ExitCode)
	}

	var b strings.Builder
	fmt.Fprintf(&b, "REPOSITORY INSPECTION RESULT (%s):\n", status)
	b.WriteString(res.Output)
	return b.String(), nil
}

func (w *Worker) repoExecScript(ctx context.Context, runCtx band.RunCtx, owner, repo string, req repoExecRequest) string {
	token := ""
	if w.source != nil {
		token = w.source.Token(ctx, runCtx.User)
	}

	url := fmt.Sprintf("https://github.com/%s/%s.git", owner, repo)
	branch := runCtx.Branch

	var b strings.Builder
	b.WriteString("set -u\n")
	b.WriteString("repo_dir=/tmp/ferry-repo\n")
	b.WriteString("need_pkgs=\"\"\n")
	b.WriteString("command -v git >/dev/null 2>&1 || need_pkgs=\"$need_pkgs git\"\n")
	b.WriteString("command -v rg >/dev/null 2>&1 || need_pkgs=\"$need_pkgs ripgrep\"\n")
	b.WriteString("if [ -n \"$need_pkgs\" ]; then apk add --no-cache $need_pkgs >/dev/null 2>&1 || exit 20; fi\n")
	b.WriteString("export GIT_TERMINAL_PROMPT=0\n")
	if token != "" {
		fmt.Fprintf(&b, "export GIT_CONFIG_COUNT=%s\n", shellQuote("1"))
		fmt.Fprintf(&b, "export GIT_CONFIG_KEY_0=%s\n", shellQuote("http.https://github.com/.extraheader"))
		fmt.Fprintf(&b, "export GIT_CONFIG_VALUE_0=%s\n", shellQuote("AUTHORIZATION: Bearer "+token))
	}
	fmt.Fprintf(&b, "repo_url=%s\n", shellQuote(url))
	fmt.Fprintf(&b, "repo_branch=%s\n", shellQuote(branch))
	b.WriteString("if [ ! -d \"$repo_dir/.git\" ]; then\n")
	b.WriteString("  rm -rf \"$repo_dir\"\n")
	b.WriteString("  if [ -n \"$repo_branch\" ]; then\n")
	b.WriteString("    git clone --depth 1 --single-branch --branch \"$repo_branch\" \"$repo_url\" \"$repo_dir\" >/tmp/ferry-clone.log 2>&1 || { cat /tmp/ferry-clone.log; exit 21; }\n")
	b.WriteString("  else\n")
	b.WriteString("    git clone --depth 1 \"$repo_url\" \"$repo_dir\" >/tmp/ferry-clone.log 2>&1 || { cat /tmp/ferry-clone.log; exit 21; }\n")
	b.WriteString("  fi\n")
	b.WriteString("else\n")
	b.WriteString("  cd \"$repo_dir\" || exit 22\n")
	b.WriteString("  git remote set-url origin \"$repo_url\" >/dev/null 2>&1\n")
	b.WriteString("  if [ -n \"$repo_branch\" ]; then\n")
	b.WriteString("    git fetch --depth 1 origin \"$repo_branch\" >/tmp/ferry-fetch.log 2>&1 || { cat /tmp/ferry-fetch.log; exit 23; }\n")
	b.WriteString("    git checkout -f FETCH_HEAD >/tmp/ferry-checkout.log 2>&1 || { cat /tmp/ferry-checkout.log; exit 24; }\n")
	b.WriteString("  else\n")
	b.WriteString("    git fetch --depth 1 origin >/tmp/ferry-fetch.log 2>&1 || { cat /tmp/ferry-fetch.log; exit 23; }\n")
	b.WriteString("    git checkout -f origin/HEAD >/tmp/ferry-checkout.log 2>&1 || true\n")
	b.WriteString("  fi\n")
	b.WriteString("fi\n")
	b.WriteString("unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 GIT_TERMINAL_PROMPT\n")
	b.WriteString("cd \"$repo_dir\" || exit 25\n")
	b.WriteString("run_cmd() {\n")
	b.WriteString("  printf '$'\n")
	b.WriteString("  for arg in \"$@\"; do printf ' %s' \"$arg\"; done\n")
	b.WriteString("  printf '\\n'\n")
	b.WriteString("  \"$@\" 2>&1\n")
	b.WriteString("  rc=$?\n")
	b.WriteString("  printf '\\n[exit %s]\\n\\n' \"$rc\"\n")
	b.WriteString("  return 0\n")
	b.WriteString("}\n")
	for _, cmd := range req.Commands {
		b.WriteString("run_cmd")
		for _, arg := range cmd.Args {
			b.WriteByte(' ')
			b.WriteString(shellQuote(arg))
		}
		b.WriteByte('\n')
	}
	return b.String()
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'"'"'`) + "'"
}
