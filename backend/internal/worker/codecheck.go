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
	extractRawFiles(contentWithoutFences(content, matches), files)
	return files
}

func contentWithoutFences(content string, matches [][]int) string {
	if len(matches) == 0 {
		return content
	}
	var b strings.Builder
	last := 0
	for _, idx := range matches {
		b.WriteString(content[last:idx[0]])
		b.WriteByte('\n')
		last = idx[1]
	}
	b.WriteString(content[last:])
	return b.String()
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
			if _, exists := files[currentPath]; exists {
				currentPath = ""
				body = nil
				return
			}
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
		if strings.HasPrefix(trimmed, "@Ferry") ||
			strings.HasPrefix(trimmed, "[ferry-artifact ") ||
			strings.HasPrefix(trimmed, "```") ||
			(strings.HasPrefix(trimmed, "###") && strings.Contains(strings.ToLower(trimmed), "file:")) {
			flush()
			continue
		}
		body = append(body, line)
	}
	flush()
}

func extractFileFromFence(content string, matches [][]int, i int, info, body string) (path, code string, ok bool) {
	if nonCodeFenceInfo(info) {
		return "", "", false
	}
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

func nonCodeFenceInfo(info string) bool {
	switch strings.ToLower(strings.TrimSpace(info)) {
	case "text", "txt", "plain", "markdown", "md":
		return true
	default:
		return false
	}
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

	status := classifySandboxStatus(mode, res, files)
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
		// Generated modules frequently declare a clean module name (e.g.
		// `internship-test-api`) but import their own packages via the source
		// repo's GitHub path (`github.com/owner/repo/internal/...`). That mismatch
		// makes Go treat every self-package as an external dependency and try to
		// fetch it from the network, which always fails in the file-only sandbox.
		// Reconcile the import prefix to the module name so self-imports resolve
		// locally (and any genuinely-missing package fails offline with a clean
		// `is not in std` error instead of an opaque VCS fetch).
		files, module := reconcileGoModule(files)
		cmd := "go build ./..."
		if mode == "test" {
			cmd = "go test ./..."
		}
		// The sandbox rootfs is mounted read-only, so Go's default cache/state
		// dirs under /root are unwritable. Point HOME and the Go caches at the
		// /tmp tmpfs (rw) so the build cache can initialize.
		env := "export HOME=/tmp GOCACHE=/tmp/.cache/go-build GOPATH=/tmp/go GOMODCACHE=/tmp/go/pkg/mod GOTMPDIR=/tmp CGO_ENABLED=0; "
		setup := ""
		timeout := 180 * time.Second
		if usesNativeGo(files) {
			env = "export HOME=/tmp GOCACHE=/tmp/.cache/go-build GOPATH=/tmp/go GOMODCACHE=/tmp/go/pkg/mod GOTMPDIR=/tmp CGO_ENABLED=1; "
			setup = "if [ ! -f /tmp/ferry-native-go-ready ]; then apk add --no-cache build-base alsa-lib-dev libx11-dev libxrandr-dev libxcursor-dev libxinerama-dev libxi-dev mesa-dev pkgconf 2>&1 && touch /tmp/ferry-native-go-ready; fi; "
			timeout = 300 * time.Second
		}
		script := goSandboxScript(env, setup, cmd, module, hasFile(files, "go.mod"))
		return sandbox.Spec{Image: "golang:1.25-alpine", Files: files, Script: script, Timeout: timeout}, true
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

func goSandboxScript(env, setup, cmd, module string, hasGoMod bool) string {
	init := ""
	if !hasGoMod {
		if module == "" {
			module = "ferrygen"
		}
		init = fmt.Sprintf("if [ ! -f go.mod ]; then go mod init %s >/dev/null 2>&1; fi; ", module)
	}
	return fmt.Sprintf(
		"%s%s%s{ go mod tidy; } 2>&1; prep_rc=$?; if [ $prep_rc -ne 0 ]; then echo \"---exit:$prep_rc\"; exit $prep_rc; fi; %s 2>&1; rc=$?; echo \"---exit:$rc\"; exit $rc",
		env,
		setup,
		init,
		cmd,
	)
}

var importLit = regexp.MustCompile(`"([^"\n]+)"`)
var goModuleLine = regexp.MustCompile(`(?m)^\s*module\s+(\S+)\s*$`)

// reconcileGoModule makes a generated Go module self-consistent before codecheck.
// It detects the import prefix the code uses for its own packages (e.g.
// `github.com/owner/repo`) and rewrites it to the go.mod module name so those
// imports resolve locally instead of being fetched from GitHub. Returns the
// (possibly) rewritten files and the module name to `go mod init` with when no
// go.mod is present.
func reconcileGoModule(files map[string]string) (map[string]string, string) {
	module := "ferrygen"
	if content, ok := goModContent(files); ok {
		if m := goModuleLine.FindStringSubmatch(content); m != nil {
			module = m[1]
		}
	}

	prefix := detectSelfImportPrefix(files, localPackageDirs(files))
	if prefix == "" || prefix == module {
		return files, module
	}

	out := make(map[string]string, len(files))
	for path, content := range files {
		if strings.HasSuffix(path, ".go") {
			content = rewriteImportPrefix(content, prefix, module)
		}
		out[path] = content
	}
	return out, module
}

func goModContent(files map[string]string) (string, bool) {
	for path, content := range files {
		if path == "go.mod" || strings.HasSuffix(path, "/go.mod") {
			return content, true
		}
	}
	return "", false
}

// localPackageDirs returns the set of directories that contain at least one .go
// file, relative to the module root (root files map to "").
func localPackageDirs(files map[string]string) map[string]bool {
	dirs := make(map[string]bool)
	for path := range files {
		if !strings.HasSuffix(path, ".go") {
			continue
		}
		dir := ""
		if i := strings.LastIndex(path, "/"); i >= 0 {
			dir = path[:i]
		}
		dirs[dir] = true
	}
	return dirs
}

// detectSelfImportPrefix finds the import-path prefix the generated code uses for
// its own packages, by matching imports of the form `<prefix>/<localdir>` against
// directories that actually exist in the generated file set. The prefix matching
// the most distinct local packages wins, so unrelated external deps (which never
// match a generated directory) are ignored.
func detectSelfImportPrefix(files map[string]string, localDirs map[string]bool) string {
	matched := make(map[string]map[string]bool) // prefix -> set of local dirs
	for path, content := range files {
		if !strings.HasSuffix(path, ".go") {
			continue
		}
		for _, imp := range importPaths(content) {
			if !strings.Contains(imp, "/") {
				continue
			}
			for dir := range localDirs {
				if dir == "" || imp == dir {
					continue
				}
				if !strings.HasSuffix(imp, "/"+dir) {
					continue
				}
				prefix := strings.TrimSuffix(imp, "/"+dir)
				if prefix == "" {
					continue
				}
				if matched[prefix] == nil {
					matched[prefix] = make(map[string]bool)
				}
				matched[prefix][dir] = true
			}
		}
	}

	best, bestN := "", 0
	for prefix, dirs := range matched {
		if len(dirs) > bestN {
			best, bestN = prefix, len(dirs)
		}
	}
	return best
}

// importPaths extracts the quoted import paths from a Go source file, scanning
// only `import "x"` lines and `import ( ... )` blocks so unrelated string
// literals are not treated as imports.
func importPaths(content string) []string {
	var out []string
	inBlock := false
	for _, raw := range strings.Split(normalizeNewlines(content), "\n") {
		line := strings.TrimSpace(raw)
		switch {
		case inBlock:
			if line == ")" {
				inBlock = false
				continue
			}
			if m := importLit.FindStringSubmatch(line); m != nil {
				out = append(out, m[1])
			}
		case strings.HasPrefix(line, "import ("):
			inBlock = true
		case strings.HasPrefix(line, "import "):
			if m := importLit.FindStringSubmatch(line); m != nil {
				out = append(out, m[1])
			}
		}
	}
	return out
}

// rewriteImportPrefix swaps a self-import prefix to the module name, operating
// only on quoted import paths so comments and other strings are left intact.
func rewriteImportPrefix(content, prefix, module string) string {
	content = strings.ReplaceAll(content, `"`+prefix+`/`, `"`+module+`/`)
	content = strings.ReplaceAll(content, `"`+prefix+`"`, `"`+module+`"`)
	return content
}

func classifySandboxStatus(mode string, res sandbox.Result, files map[string]string) string {
	switch {
	case res.TimedOut:
		return "TIMED OUT"
	case res.ExitCode == 0 && mode == "test":
		return "PASS"
	case res.ExitCode == 0:
		return "SUCCESS"
	case environmentOnlyUnsupported(res.Output, files):
		return "UNSUPPORTED"
	case mode == "test":
		return "FAIL"
	default:
		return fmt.Sprintf("exit %d", res.ExitCode)
	}
}

func environmentOnlyUnsupported(output string, files map[string]string) bool {
	if !usesNativeGo(files) || hasGeneratedFileFailure(output, files) {
		return false
	}
	return hasUnsupportedEnvironmentMarker(output)
}

func hasUnsupportedEnvironmentMarker(output string) bool {
	lower := strings.ToLower(output)
	return strings.Contains(lower, "internal/cglfw: build constraints exclude all go files") ||
		strings.Contains(lower, "undefined: glfw.window") ||
		strings.Contains(lower, "undefined: glfw.windowhint") ||
		strings.Contains(lower, "the display environment variable is missing") ||
		strings.Contains(lower, "glfw: x11")
}

func hasGeneratedFileFailure(output string, files map[string]string) bool {
	for _, raw := range strings.Split(normalizeNewlines(output), "\n") {
		line := strings.TrimSpace(raw)
		lower := strings.ToLower(line)
		if line == "" {
			continue
		}
		if strings.Contains(lower, "errors parsing go.mod") ||
			strings.Contains(lower, "no required module provides package") ||
			strings.Contains(lower, "is not in std") ||
			strings.Contains(lower, "does not contain package") ||
			(strings.Contains(lower, "pattern ") && strings.Contains(lower, "no matching files found")) {
			return true
		}
		for path := range files {
			if strings.HasPrefix(line, path+":") ||
				strings.HasPrefix(line, "./"+path+":") ||
				strings.Contains(line, "/work/"+path+":") {
				return true
			}
		}
	}
	return false
}

func usesNativeGo(files map[string]string) bool {
	for _, content := range files {
		if strings.Contains(content, "github.com/hajimehoshi/ebiten") ||
			strings.Contains(content, "github.com/hajimehoshi/ebiten/v2") {
			return true
		}
	}
	return false
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

	// Surface imported-but-not-generated packages first and explicitly, so the
	// rework prompt names exactly which packages the Code Generator must emit.
	for _, pkg := range missingPackages(lines) {
		hint := "MISSING PACKAGE: " + pkg + " — imported but not generated; emit this package"
		if seen[hint] {
			continue
		}
		seen[hint] = true
		selected = append(selected, "- "+hint)
		if len(selected) == 6 {
			return strings.Join(selected, "\n")
		}
	}

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

var missingPkgRe = regexp.MustCompile(`(?:package\s+(\S+?)\s+is not in std|does not contain package\s+(\S+)|no required module provides package\s+([^\s;]+))`)

// missingPackages extracts package import paths that Go reported as unresolved —
// the signature of a generated file referencing a package that was never emitted.
func missingPackages(lines []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, raw := range lines {
		m := missingPkgRe.FindStringSubmatch(raw)
		if m == nil {
			continue
		}
		pkg := m[1]
		if pkg == "" {
			pkg = m[2]
		}
		if pkg == "" {
			pkg = m[3]
		}
		pkg = strings.Trim(pkg, "\"")
		if pkg == "" || seen[pkg] {
			continue
		}
		seen[pkg] = true
		out = append(out, pkg)
	}
	return out
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
