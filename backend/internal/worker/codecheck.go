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

var fencedBlock = regexp.MustCompile("(?s)```[^\n]*\n(.*?)```")

var fileMarker = regexp.MustCompile(`^\s*(?://|#)\s*file:\s*(\S+)\s*$`)

func extractFiles(content string) map[string]string {
	files := make(map[string]string)
	for _, m := range fencedBlock.FindAllStringSubmatch(content, -1) {
		body := m[1]
		lines := strings.SplitN(body, "\n", 2)
		if len(lines) < 2 {
			continue
		}
		mk := fileMarker.FindStringSubmatch(lines[0])
		if mk == nil {
			continue
		}
		path := strings.TrimPrefix(mk[1], "./")
		if path == "" || strings.Contains(path, "..") {
			continue
		}
		files[path] = strings.TrimRight(lines[1], "\n") + "\n"
	}
	return files
}

type codeCheckResult struct {
	kind   string
	status string
	output string
	files  int
}

func (r *codeCheckResult) promptText() string {
	return fmt.Sprintf("SANDBOX %s RESULT (%d files, %s):\n%s", strings.ToUpper(r.kind), r.files, r.status, r.output)
}

func (r *codeCheckResult) artifactBlock() string {
	return band.MarshalArtifact(band.Artifact{Kind: r.kind, Status: r.status, Body: r.output})
}

func (w *Worker) runCodeChecks(ctx context.Context, chatID, targetLang, extraContent, mode string) *codeCheckResult {
	msgs, err := w.client.ListMessages(ctx, chatID)
	if err != nil {
		log.Printf("[%s] code-check: list messages: %v", w.info.Key, err)
		return nil
	}
	var all strings.Builder
	for _, m := range msgs {
		all.WriteString(m.Content)
		all.WriteString("\n")
	}
	all.WriteString(extraContent)

	files := extractFiles(all.String())
	if len(files) == 0 {
		return nil
	}

	spec, ok := specFor(targetLang, mode, files)
	if !ok {
		return nil
	}
	log.Printf("[%s] code-check: %s of %d generated file(s) in sandbox", w.info.Key, mode, len(files))

	res, err := sandbox.Execute(ctx, w.runnerURL, spec)
	if err != nil {
		log.Printf("[%s] code-check: sandbox: %v", w.info.Key, err)
		return nil
	}

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
	return &codeCheckResult{kind: mode, status: status, output: res.Output, files: len(files)}
}

func specFor(targetLang, mode string, files map[string]string) (sandbox.Spec, bool) {
	switch strings.ToLower(targetLang) {
	case "go":
		cmd := "go build ./..."
		if mode == "test" {
			cmd = "go test ./..."
		}
		prefix := ""
		if !hasFile(files, "go.mod") {
			prefix = "go mod init ferrygen >/dev/null 2>&1; "
		}
		script := fmt.Sprintf("%s%s 2>&1; echo \"---exit:$?\"", prefix, cmd)
		return sandbox.Spec{Image: "golang:1.25-alpine", Files: files, Script: script, Timeout: 120 * time.Second}, true
	case "rust":
		cmd := "cargo build"
		if mode == "test" {
			cmd = "cargo test"
		}
		script := fmt.Sprintf("%s 2>&1; echo \"---exit:$?\"", cmd)
		if !hasFile(files, "Cargo.toml") {
			script = `for f in $(find . -name '*.rs'); do rustc --edition 2021 "$f" -o /tmp/out 2>&1; done; echo "---exit:$?"`
		}
		return sandbox.Spec{Image: "rust:1-alpine", Files: files, Script: script, Timeout: 150 * time.Second}, true
	default:
		return sandbox.Spec{}, false
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
