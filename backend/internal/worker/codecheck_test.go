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

func TestExtractFilesFromRawSections(t *testing.T) {
	content := `// file: go.mod
module ferry-booking

go 1.23
---
// file: cmd/main.go
package main

func main() {}
`
	files := extractFiles(content)
	if got := files["go.mod"]; !strings.Contains(got, "module ferry-booking") {
		t.Fatalf("expected raw go.mod to be extracted, got %q", got)
	}
	if got := files["cmd/main.go"]; !strings.Contains(got, "func main() {}") {
		t.Fatalf("expected raw cmd/main.go to be extracted, got %q", got)
	}
}

func TestExtractFilesAcceptsSingleSlashHeader(t *testing.T) {
	content := `/ file: go.mod
module ferry-booking
`
	files := extractFiles(content)
	if got := files["go.mod"]; !strings.Contains(got, "module ferry-booking") {
		t.Fatalf("expected single-slash file header to be extracted, got %q", got)
	}
}

func TestExtractFilesAcceptsFileHeaderVariants(t *testing.T) {
	cases := []struct {
		name   string
		header string
	}{
		{name: "double slash spaced", header: "// file: go.mod"},
		{name: "single slash spaced", header: "/ file: go.mod"},
		{name: "single slash tight", header: "/file: go.mod"},
		{name: "double slash tight", header: "//file: go.mod"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			content := tc.header + "\nmodule ferry-booking\n"
			files := extractFiles(content)
			if got := files["go.mod"]; !strings.Contains(got, "module ferry-booking") {
				t.Fatalf("expected variant %q to be extracted, got %q", tc.header, got)
			}
		})
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

func TestSpecForGoRunsModTidyWithExistingGoMod(t *testing.T) {
	spec, ok := specFor("go", "test", map[string]string{
		"go.mod":      "module ferrygen\n\ngo 1.23\n",
		"cmd/main.go": "package main\nfunc main() {}\n",
	})
	if !ok {
		t.Fatalf("expected go spec")
	}
	if !strings.Contains(spec.Script, "go mod tidy") {
		t.Fatalf("expected go sandbox script to run go mod tidy, got %q", spec.Script)
	}
	if strings.Contains(spec.Script, "go mod init ferrygen") {
		t.Fatalf("did not expect go mod init when go.mod already exists")
	}
}

func TestSpecForGoBootstrapsModuleWhenMissingGoMod(t *testing.T) {
	spec, ok := specFor("go", "build", map[string]string{
		"cmd/main.go": "package main\nfunc main() {}\n",
	})
	if !ok {
		t.Fatalf("expected go spec")
	}
	if !strings.Contains(spec.Script, "go mod init ferrygen") {
		t.Fatalf("expected go sandbox script to initialize module, got %q", spec.Script)
	}
	if !strings.Contains(spec.Script, "go mod tidy") {
		t.Fatalf("expected go sandbox script to run go mod tidy after init, got %q", spec.Script)
	}
}
