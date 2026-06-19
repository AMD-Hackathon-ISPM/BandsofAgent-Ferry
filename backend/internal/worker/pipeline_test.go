package worker

import (
	"context"
	"strings"
	"testing"
)

// newTestWorker builds a Worker with no Redis so claimStep exercises the
// in-memory idempotency fallback (the path used when rdb is nil).
func newTestWorker(key string) *Worker {
	return &Worker{
		info:  AgentInfo{Key: key, Name: key},
		steps: make(map[string]bool),
	}
}

func TestClaimStepIdempotency(t *testing.T) {
	w := newTestWorker("reviewer")
	ctx := context.Background()

	if !w.claimStep(ctx, "run1", "reviewer", 0) {
		t.Fatal("first claim should win")
	}
	if w.claimStep(ctx, "run1", "reviewer", 0) {
		t.Fatal("second claim for the same step must be rejected (would be a duplicate run)")
	}
	// A different rework cycle is a distinct step — the legit Commander loop.
	if !w.claimStep(ctx, "run1", "reviewer", 1) {
		t.Fatal("claim for a new rework cycle should win")
	}
	// A different run is independent.
	if !w.claimStep(ctx, "run2", "reviewer", 0) {
		t.Fatal("claim for a different run should win")
	}
}

func TestReleaseStepAllowsRetry(t *testing.T) {
	w := newTestWorker("code_generator")
	ctx := context.Background()

	if !w.claimStep(ctx, "run1", "code_generator", 0) {
		t.Fatal("first claim should win")
	}
	w.releaseStep(ctx, "run1", "code_generator", 0)
	if !w.claimStep(ctx, "run1", "code_generator", 0) {
		t.Fatal("after release the step must be re-claimable (retry on redelivery)")
	}
}

func TestExtractBlockerPaths(t *testing.T) {
	in := "BLOCKERS:\n- undefined: Foo in ./cmd/main.go and internal/svc/handler.go\n" +
		"- missing go.mod\n- duplicate ./cmd/main.go again\n- see Cargo.toml and tests/foo.rs"
	got := extractBlockerPaths(in)
	want := map[string]bool{
		"cmd/main.go":             true,
		"internal/svc/handler.go": true,
		"go.mod":                  true,
		"Cargo.toml":              true,
		"tests/foo.rs":            true,
	}
	if len(got) != len(want) {
		t.Fatalf("got %d paths %v, want %d unique", len(got), got, len(want))
	}
	for _, p := range got {
		if !want[p] {
			t.Fatalf("unexpected path %q in %v", p, got)
		}
	}
}

func TestReworkNoteTargeted(t *testing.T) {
	w := newTestWorker("commander")
	incoming := "BLOCKERS:\n- undefined: Bar in internal/api/server.go\n- no matching files found"
	note := w.reworkNote(1, 2, incoming)
	if !strings.Contains(note, "REGENERATE ONLY") {
		t.Fatalf("targeted rework note should say REGENERATE ONLY, got:\n%s", note)
	}
	if !strings.Contains(note, "internal/api/server.go") {
		t.Fatalf("targeted rework note should list the flagged file, got:\n%s", note)
	}
}

func TestChangedFilesReport(t *testing.T) {
	prev := map[string]string{
		"main.go": "package main\nfunc main() { old() }\n",
		"gone.go": "package x\n",
	}
	cur := map[string]string{
		"main.go": "package main\nfunc main() { fixed() }\n",
		"new.go":  "package x\n",
	}
	rep := changedFilesReport(prev, cur)
	if rep == "" {
		t.Fatal("expected a non-empty change report")
	}
	for _, want := range []string{"+ new.go (new)", "~ main.go (modified)", "- gone.go (removed)", "+ func main() { fixed() }", "- func main() { old() }"} {
		if !strings.Contains(rep, want) {
			t.Fatalf("report missing %q:\n%s", want, rep)
		}
	}

	if changedFilesReport(prev, prev) != "" {
		t.Fatal("identical file sets should report no changes")
	}
}

func TestFileManifest(t *testing.T) {
	files := map[string]string{"b.go": "x", "a.go": "y"}
	got := fileManifest("Code Generator", files, 2)
	if !strings.Contains(got, "rework 2") {
		t.Fatalf("manifest should note the rework cycle: %s", got)
	}
	if !strings.Contains(got, "files modified") {
		t.Fatalf("rework manifest should say files modified: %s", got)
	}
	// Sorted order.
	if strings.Index(got, "a.go") > strings.Index(got, "b.go") {
		t.Fatalf("manifest paths should be sorted: %s", got)
	}
}

func TestHandoffSummaryProducesFiles(t *testing.T) {
	w := newTestWorker("code_generator")
	w.role = agentRoles["code_generator"]
	got := w.handoffSummary("...big code output...", map[string]string{"a.go": "x", "b.go": "y"}, 0)
	if !strings.Contains(got, "2 file(s)") || !strings.Contains(got, "changes.md") {
		t.Fatalf("file-producing summary should cite count + doc name: %s", got)
	}
	if !strings.Contains(got, "produced") {
		t.Fatalf("initial file-producing summary should say produced: %s", got)
	}
	if strings.Contains(got, "big code output") {
		t.Fatalf("summary must not embed the raw output: %s", got)
	}
}

func TestHandoffSummaryModifiesFilesOnRework(t *testing.T) {
	w := newTestWorker("code_generator")
	w.role = agentRoles["code_generator"]
	got := w.handoffSummary("...big code output...", map[string]string{"a.go": "x"}, 1)
	if !strings.Contains(got, "modified 1 file(s)") {
		t.Fatalf("rework file-producing summary should say modified: %s", got)
	}
}

func TestHeadExcerptCaps(t *testing.T) {
	in := "l1\n\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10"
	got := headExcerpt(in, 3, 1000)
	if got != "l1\nl2\nl3" {
		t.Fatalf("headExcerpt line cap = %q", got)
	}
	if c := headExcerpt(strings.Repeat("x", 50), 5, 10); c != strings.Repeat("x", 10)+"…" {
		t.Fatalf("headExcerpt char cap not applied: %q (len %d)", c, len(c))
	}
}
