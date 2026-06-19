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

func TestExtractFilesDoesNotLetRawFallbackCorruptFencedFiles(t *testing.T) {
	content := "```go\n// file: go.mod\nmodule ferry-booking\n\ngo 1.23\n```\n\n---\n\n### File: `go.sum`\n\n```go\n"
	files := extractFiles(content)
	if got := files["go.mod"]; got != "module ferry-booking\n\ngo 1.23\n" {
		t.Fatalf("go.mod = %q", got)
	}
	if strings.Contains(files["go.mod"], "```") || strings.Contains(files["go.mod"], "File:") {
		t.Fatalf("go.mod contains markdown leakage: %q", files["go.mod"])
	}
}

func TestExtractFilesRawFallbackIgnoresMarkersInsideFences(t *testing.T) {
	content := "```text\n// file: go.mod\nthis is documentation, not a generated file\n```\n"
	files := extractFiles(content)
	if len(files) != 0 {
		t.Fatalf("expected no files, got %v", files)
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

func TestClassifySandboxStatusKeepsLocalSyntaxFailuresFatal(t *testing.T) {
	files := map[string]string{
		"flappybird_test.go": "package main\n",
		"go.mod":             "module game\n",
	}
	output := "flappybird_test.go:213:1: expected declaration, found ``\n# github.com/hajimehoshi/ebiten/v2/internal/graphicsdriver/opengl\n/go/pkg/mod/github.com/hajimehoshi/ebiten/v2@v2.9.9/internal/graphicsdriver/opengl/graphics_linbsd.go:71:15: undefined: glfw.Window\n"

	if got := classifySandboxStatus("test", sandbox.Result{ExitCode: 1, Output: output}, files); got != "FAIL" {
		t.Fatalf("status = %q, want FAIL", got)
	}
}

func TestClassifySandboxStatusMarksEnvironmentOnlyGraphicsFailureUnsupported(t *testing.T) {
	files := map[string]string{
		"go.mod":  "module game\n\nrequire github.com/hajimehoshi/ebiten/v2 v2.9.9\n",
		"main.go": "package main\n\nimport _ \"github.com/hajimehoshi/ebiten/v2\"\n",
	}
	output := "package game\n\timports github.com/hajimehoshi/ebiten/v2/internal/cglfw: build constraints exclude all Go files in /tmp/go/pkg/mod/github.com/hajimehoshi/ebiten/v2@v2.6.3/internal/cglfw\n"

	if got := classifySandboxStatus("build", sandbox.Result{ExitCode: 1, Output: output}, files); got != "UNSUPPORTED" {
		t.Fatalf("status = %q, want UNSUPPORTED", got)
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

func TestReconcileGoModuleRewritesMismatchedSelfImportPrefix(t *testing.T) {
	files := map[string]string{
		"go.mod": "module internship-test-api\n\ngo 1.25\n",
		"cmd/main.go": "package main\n\nimport (\n" +
			"\t\"context\"\n" +
			"\t\"github.com/PaulusBilly/internship-test-API/internal/config\"\n" +
			"\t\"github.com/PaulusBilly/internship-test-API/internal/dto\"\n" + // dir absent on purpose
			"\t\"github.com/go-chi/chi/v5\"\n" +
			")\n\nfunc main() { _ = context.Background }\n",
		"internal/config/config.go": "package config\n",
	}

	out, module := reconcileGoModule(files)
	if module != "internship-test-api" {
		t.Fatalf("module = %q, want internship-test-api", module)
	}
	main := out["cmd/main.go"]
	if strings.Contains(main, "github.com/PaulusBilly/internship-test-API") {
		t.Fatalf("self-import prefix not rewritten: %q", main)
	}
	if !strings.Contains(main, `"internship-test-api/internal/config"`) ||
		!strings.Contains(main, `"internship-test-api/internal/dto"`) {
		t.Fatalf("expected self-imports rewritten to module path: %q", main)
	}
	if !strings.Contains(main, `"github.com/go-chi/chi/v5"`) {
		t.Fatalf("external dependency must not be rewritten: %q", main)
	}
}

func TestReconcileGoModuleLeavesConsistentModuleUnchanged(t *testing.T) {
	files := map[string]string{
		"go.mod":                    "module example.com/app\n\ngo 1.25\n",
		"cmd/main.go":               "package main\n\nimport \"example.com/app/internal/config\"\n",
		"internal/config/config.go": "package config\n",
	}
	out, module := reconcileGoModule(files)
	if module != "example.com/app" {
		t.Fatalf("module = %q, want example.com/app", module)
	}
	if out["cmd/main.go"] != files["cmd/main.go"] {
		t.Fatalf("consistent module should not be rewritten, got %q", out["cmd/main.go"])
	}
}

func TestReconcileGoModuleNoGoModDefaultsToFerrygen(t *testing.T) {
	files := map[string]string{
		"cmd/main.go":               "package main\n\nimport \"github.com/acme/svc/internal/config\"\n",
		"internal/config/config.go": "package config\n",
	}
	out, module := reconcileGoModule(files)
	if module != "ferrygen" {
		t.Fatalf("module = %q, want ferrygen", module)
	}
	if !strings.Contains(out["cmd/main.go"], `"ferrygen/internal/config"`) {
		t.Fatalf("expected self-import rewritten to ferrygen: %q", out["cmd/main.go"])
	}
}

func TestSpecForGoReconcilesImportPrefixInSpecFiles(t *testing.T) {
	spec, ok := specFor("go", "build", map[string]string{
		"go.mod":                    "module internship-test-api\n\ngo 1.25\n",
		"cmd/main.go":               "package main\n\nimport \"github.com/PaulusBilly/internship-test-API/internal/config\"\n",
		"internal/config/config.go": "package config\n",
	})
	if !ok {
		t.Fatalf("expected go spec")
	}
	if strings.Contains(spec.Files["cmd/main.go"], "github.com/PaulusBilly/internship-test-API") {
		t.Fatalf("specFor must ship reconciled files, got %q", spec.Files["cmd/main.go"])
	}
}

func TestMissingPackagesExtractsUnresolvedImports(t *testing.T) {
	lines := []string{
		"cmd/main.go:18:2: package internship-test-api/internal/dto is not in std (/usr/local/go/src/internship-test-api/internal/dto)",
		"go: m/cmd imports github.com/x/y/internal/foo: module github.com/x/y@latest found, but does not contain package github.com/x/y/internal/foo",
		"cmd/main.go:11:2: no required module provides package github.com/go-sql-driver/mysql; to add it:",
	}
	got := missingPackages(lines)
	want := map[string]bool{
		"internship-test-api/internal/dto": true,
		"github.com/x/y/internal/foo":      true,
		"github.com/go-sql-driver/mysql":   true,
	}
	if len(got) != len(want) {
		t.Fatalf("missingPackages = %v, want keys %v", got, want)
	}
	for _, pkg := range got {
		if !want[pkg] {
			t.Fatalf("unexpected package %q in %v", pkg, got)
		}
	}
}

func TestSummarizeSandboxOutputFlagsMissingPackage(t *testing.T) {
	output := "cmd/main.go:18:2: package internship-test-api/internal/dto is not in std (/x)\n---exit:1\n"
	summary := summarizeSandboxOutput(output)
	if !strings.Contains(summary, "MISSING PACKAGE: internship-test-api/internal/dto") {
		t.Fatalf("expected missing-package hint, got %q", summary)
	}
}
