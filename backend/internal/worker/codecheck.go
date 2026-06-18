package worker

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/sandbox"
)

var fencedBlock = regexp.MustCompile("(?s)```([^\n]*)\n(.*?)```")

var fileMarker = regexp.MustCompile(`(?i)^\s*(?://+|/|#|--|/\*)?\s*file\s*:\s*([^\s*]+)\s*(?:\*/)?\s*$`)
var barePathLine = regexp.MustCompile(`^(?:\./)?[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$`)
var exitMarker = regexp.MustCompile(`(?m)^---exit:(\d+)\s*$`)

func extractFiles(content string) map[string]string {
	files := make(map[string]string)
	matches := fencedBlock.FindAllStringSubmatchIndex(content, -1)
	for i, idx := range matches {
		info := strings.TrimSpace(content[idx[2]:idx[3]])
		body := normalizeNewlines(content[idx[4]:idx[5]])

		path, code, ok := extractFileFromFence(content, matches, i, info, body)
		if !ok {
			continue
		}
		files[path] = code
	}
	extractRawFiles(content, files)
	return files
}

func extractRawFiles(content string, files map[string]string) {
	lines := strings.Split(normalizeNewlines(content), "\n")
	currentPath := ""
	var body []string

	flush := func() {
		if currentPath == "" {
			body = nil
			return
		}
		code := cleanRawFileBody(body)
		if code != "" {
			files[currentPath] = ensureTrailingNewline(code)
		}
		currentPath = ""
		body = nil
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if mk := fileMarker.FindStringSubmatch(trimmed); mk != nil {
			flush()
			if path, ok := sanitizeFilePath(mk[1]); ok {
				currentPath = path
			}
			continue
		}
		if currentPath == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "@Ferry") || strings.HasPrefix(trimmed, "[ferry-artifact ") {
			flush()
			continue
		}
		body = append(body, line)
	}
	flush()
}

func extractFileFromFence(content string, matches [][]int, i int, info, body string) (path, code string, ok bool) {
	lines := strings.Split(body, "\n")
	for n := 0; n < len(lines) && n < 5; n++ {
		if mk := fileMarker.FindStringSubmatch(strings.TrimSpace(lines[n])); mk != nil {
			path, ok = sanitizeFilePath(mk[1])
			if !ok {
				return "", "", false
			}
			code = strings.Join(lines[n+1:], "\n")
			code = strings.TrimLeft(code, "\n")
			return path, ensureTrailingNewline(code), true
		}
	}

	prevText := ""
	if i > 0 {
		prevText = content[matches[i-1][1]:matches[i][0]]
	} else {
		prevText = content[:matches[i][0]]
	}
	for _, line := range trailingNonEmptyLines(normalizeNewlines(prevText), 3) {
		if mk := fileMarker.FindStringSubmatch(line); mk != nil {
			path, ok = sanitizeFilePath(mk[1])
			if !ok {
				return "", "", false
			}
			return path, ensureTrailingNewline(body), true
		}
		if infoPath, ok := sanitizeFilePath(line); ok {
			return infoPath, ensureTrailingNewline(body), true
		}
	}

	if infoPath, ok := sanitizeFilePath(info); ok {
		return infoPath, ensureTrailingNewline(body), true
	}
	if mk := fileMarker.FindStringSubmatch(info); mk != nil {
		path, ok = sanitizeFilePath(mk[1])
		if ok {
			return path, ensureTrailingNewline(body), true
		}
	}

	return "", "", false
}

func trailingNonEmptyLines(s string, limit int) []string {
	lines := strings.Split(s, "\n")
	out := make([]string, 0, limit)
	for i := len(lines) - 1; i >= 0 && len(out) < limit; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		out = append([]string{line}, out...)
	}
	return out
}

func sanitizeFilePath(raw string) (string, bool) {
	path := strings.TrimSpace(raw)
	path = strings.Trim(path, "`*_")
	path = strings.TrimPrefix(path, "./")
	path = strings.TrimSuffix(path, ":")
	if path == "" || strings.Contains(path, "..") || strings.ContainsAny(path, `\`) {
		return "", false
	}
	if !strings.Contains(path, "/") && !strings.Contains(path, ".") {
		return "", false
	}
	if !barePathLine.MatchString(path) {
		return "", false
	}
	return path, true
}

func normalizeNewlines(s string) string {
	return strings.ReplaceAll(s, "\r\n", "\n")
}

func ensureTrailingNewline(s string) string {
	return strings.TrimRight(s, "\n") + "\n"
}

func cleanRawFileBody(lines []string) string {
	body := strings.Join(lines, "\n")
	body = strings.TrimLeft(body, "\n")
	body = strings.TrimRight(body, "\n")
	if body == "" {
		return ""
	}

	parts := strings.Split(body, "\n")
	if len(parts) > 0 && strings.HasPrefix(strings.TrimSpace(parts[0]), "```") {
		parts = parts[1:]
	}
	if len(parts) > 0 && strings.TrimSpace(parts[len(parts)-1]) == "```" {
		parts = parts[:len(parts)-1]
	}
	for len(parts) > 0 && strings.TrimSpace(parts[len(parts)-1]) == "---" {
		parts = parts[:len(parts)-1]
	}
	for len(parts) > 0 && strings.TrimSpace(parts[len(parts)-1]) == "" {
		parts = parts[:len(parts)-1]
	}
	return strings.Join(parts, "\n")
}

type codeCheckResult struct {
	kind    string
	status  string
	output  string
	files   int
	summary string
}

func (r *codeCheckResult) promptText() string {
	var b strings.Builder
	fmt.Fprintf(&b, "SANDBOX %s RESULT (%d files, %s)", strings.ToUpper(r.kind), r.files, r.status)
	if r.summary != "" {
		fmt.Fprintf(&b, "\nKEY DIAGNOSTICS:\n%s", r.summary)
	}
	fmt.Fprintf(&b, "\nRAW OUTPUT:\n%s", r.output)
	return b.String()
}

func (r *codeCheckResult) artifactBlock() string {
	return band.MarshalArtifact(band.Artifact{Kind: r.kind, Status: r.status, Body: r.output})
}

func (w *Worker) runCodeChecks(ctx context.Context, runID, targetLang, mode string) *codeCheckResult {
	files := w.loadFiles(ctx, runID)
	if len(files) == 0 {
		return nil
	}

	spec, ok := specFor(targetLang, mode, files)
	if !ok {
		return nil
	}
	// Run in the per-run persistent workspace so files + build/module caches
	// survive across the code → test → review → rework cycle.
	spec.RunID = runID
	log.Printf("[%s] code-check: %s of %d generated file(s) in run workspace", w.info.Key, mode, len(files))

	res, err := sandbox.Execute(ctx, w.runnerURL, spec)
	if err != nil {
		log.Printf("[%s] code-check: sandbox: %v", w.info.Key, err)
		return nil
	}
	res = normalizeSandboxResult(res)

	status := fmt.Sprintf("exit %d", res.ExitCode)
	switch {
	case res.TimedOut:
		status = "TIMED OUT"
	case res.ExitCode == 0 && mode == "test":
		status = "PASS"
	case res.ExitCode == 0:
		status = "SUCCESS"
	case mode == "test":
		status = "FAIL"
	}
	return &codeCheckResult{
		kind:    mode,
		status:  status,
		output:  res.Output,
		files:   len(files),
		summary: summarizeSandboxOutput(res.Output),
	}
}

// cleanupWorkspace tears down the run's persistent build container once the run
// is finished (the reaper is the backstop if this is missed).
func (w *Worker) cleanupWorkspace(ctx context.Context, runID string) {
	if !w.execEnabled || runID == "" {
		return
	}
	sandbox.Cleanup(ctx, w.runnerURL, runID)
}

func specFor(targetLang, mode string, files map[string]string) (sandbox.Spec, bool) {
	switch strings.ToLower(targetLang) {
	case "go":
		cmd := "go build ./..."
		if mode == "test" {
			cmd = "go test ./..."
		}
		// The sandbox rootfs is mounted read-only, so Go's default cache/state
		// dirs under /root are unwritable. Point HOME and the Go caches at the
		// /tmp tmpfs (rw) so the build cache can initialize.
		env := "export HOME=/tmp GOCACHE=/tmp/.cache/go-build GOPATH=/tmp/go GOMODCACHE=/tmp/go/pkg/mod GOTMPDIR=/tmp; "
		script := goSandboxScript(env, cmd, hasFile(files, "go.mod"))
		return sandbox.Spec{Image: "golang:1.25-alpine", Files: files, Script: script, Timeout: 180 * time.Second}, true
	case "rust":
		// Same read-only rootfs constraint: cargo writes to $CARGO_HOME (default
		// /root/.cargo). Redirect HOME + CARGO_HOME into the /tmp tmpfs.
		env := "export HOME=/tmp CARGO_HOME=/tmp/.cargo; "
		cmd := "cargo build"
		if mode == "test" {
			cmd = "cargo test"
		}
		script := fmt.Sprintf("%s%s 2>&1; rc=$?; echo \"---exit:$rc\"; exit $rc", env, cmd)
		if !hasFile(files, "Cargo.toml") {
			script = env + `rc=0; for f in $(find . -name '*.rs'); do rustc --edition 2021 "$f" -o /tmp/out 2>&1 || rc=$?; done; echo "---exit:$rc"; exit $rc`
		}
		return sandbox.Spec{Image: "rust:1-alpine", Files: files, Script: script, Timeout: 240 * time.Second}, true
	default:
		return sandbox.Spec{}, false
	}
}

func goSandboxScript(env, cmd string, hasGoMod bool) string {
	init := ""
	if !hasGoMod {
		init = "if [ ! -f go.mod ]; then go mod init ferrygen >/dev/null 2>&1; fi; "
	}
	return fmt.Sprintf(
		"%s%s{ go mod tidy; } 2>&1; prep_rc=$?; if [ $prep_rc -ne 0 ]; then echo \"---exit:$prep_rc\"; exit $prep_rc; fi; %s 2>&1; rc=$?; echo \"---exit:$rc\"; exit $rc",
		env,
		init,
		cmd,
	)
}

func normalizeSandboxResult(res sandbox.Result) sandbox.Result {
	matches := exitMarker.FindStringSubmatch(res.Output)
	if len(matches) == 2 {
		if code := matches[1]; code != "" {
			var parsed int
			fmt.Sscanf(code, "%d", &parsed)
			res.ExitCode = parsed
		}
		res.Output = strings.TrimSpace(exitMarker.ReplaceAllString(res.Output, ""))
	}
	return res
}

func summarizeSandboxOutput(output string) string {
	lines := strings.Split(normalizeNewlines(output), "\n")
	seen := map[string]bool{}
	selected := make([]string, 0, 6)
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || line == "FAIL" || strings.HasPrefix(line, "---exit:") {
			continue
		}
		if !relevantSandboxLine(line) {
			continue
		}
		if seen[line] {
			continue
		}
		seen[line] = true
		selected = append(selected, "- "+line)
		if len(selected) == 6 {
			break
		}
	}
	return strings.Join(selected, "\n")
}

func relevantSandboxLine(line string) bool {
	lower := strings.ToLower(line)
	switch {
	case strings.Contains(line, ":") && (strings.Contains(lower, "error") || strings.Contains(lower, "fail")):
		return true
	case strings.Contains(lower, "no required module provides package"):
		return true
	case strings.Contains(lower, "pattern ") && strings.Contains(lower, "no matching files found"):
		return true
	case strings.Contains(lower, "undefined:"):
		return true
	case strings.Contains(lower, "cannot find"):
		return true
	case strings.Contains(lower, "panic:"):
		return true
	case strings.Contains(lower, "exit status"):
		return true
	case strings.Contains(line, ".go:") || strings.Contains(line, ".rs:") || strings.Contains(line, ".sql:"):
		return true
	default:
		return false
	}
}

func hasFile(files map[string]string, name string) bool {
	for p := range files {
		if p == name || strings.HasSuffix(p, "/"+name) {
			return true
		}
	}
	return false
}
