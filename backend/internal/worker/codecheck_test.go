package worker

import (
	"strings"
	"testing"

	"github.com/ferry/backend/internal/sandbox"
)

func TestExtractFilesMarkerInsideFence(t *testing.T) {
	content := "```go\n// file: cmd/main.go\npackage main\nfunc main() {}\n```"
	files := extractFiles(content)
	if got := files["cmd/main.go"]; got == "" {
		t.Fatalf("expected cmd/main.go to be extracted")
	}
}

func TestExtractFilesMarkerAboveFence(t *testing.T) {
	content := "File: internal/service/service.go\n```go\npackage service\n```"
	files := extractFiles(content)
	if got := files["internal/service/service.go"]; got == "" {
		t.Fatalf("expected file marker above fence to be extracted")
	}
}

func TestExtractFilesPathAsFenceInfo(t *testing.T) {
	content := "```cmd/main.go\npackage main\n```"
	files := extractFiles(content)
	if got := files["cmd/main.go"]; got == "" {
		t.Fatalf("expected fence info path to be extracted")
	}
}

func TestExtractFilesSkipsUnsafePaths(t *testing.T) {
	content := "```go\n// file: ../secrets.txt\nnope\n```"
	files := extractFiles(content)
	if len(files) != 0 {
		t.Fatalf("expected unsafe path to be skipped, got %v", files)
	}
}

func TestNormalizeSandboxResultUsesExitMarker(t *testing.T) {
	res := normalizeSandboxResult(sandbox.Result{
		Output:   "go test failed\n---exit:1\n",
		ExitCode: 0,
	})
	if res.ExitCode != 1 {
		t.Fatalf("expected exit code 1, got %d", res.ExitCode)
	}
	if strings.Contains(res.Output, "---exit:1") {
		t.Fatalf("expected exit marker to be stripped from output")
	}
}

func TestSummarizeReworkIssuesPrefersConcreteFailures(t *testing.T) {
	incoming := `BLOCKERS:
- cmd/main.go:11:2: no required module provides package github.com/go-sql-driver/mysql
- sql/migrate.go:10:12: pattern *.sql: no matching files found
[ferry-artifact kind="build" status="exit 1"]
cmd/main.go:12:2: no required module provides package github.com/joho/godotenv
---exit:1
[/ferry-artifact]`
	summary := summarizeReworkIssues(incoming)
	if !strings.Contains(summary, "github.com/go-sql-driver/mysql") {
		t.Fatalf("expected mysql dependency in summary, got %q", summary)
	}
	if !strings.Contains(summary, "pattern *.sql: no matching files found") {
		t.Fatalf("expected missing sql asset in summary, got %q", summary)
	}
}
