package worker

import (
	"encoding/json"
	"testing"

	"github.com/ferry/backend/internal/band"
)

func TestPullRequestArtifactRoundTrip(t *testing.T) {
	result := pullRequestResult{
		URL:          "https://github.com/acme/app/pull/42",
		Number:       42,
		Title:        "Ferry: migrate acme/app from php to go",
		SourceBranch: "ferry-migration-12345678",
		TargetBranch: "main",
	}

	block, err := result.artifactBlock()
	if err != nil {
		t.Fatalf("artifactBlock() error = %v", err)
	}

	artifacts, cleaned := band.ParseArtifacts("opened\n\n" + block)
	if cleaned != "opened" {
		t.Fatalf("cleaned content = %q, want %q", cleaned, "opened")
	}
	if len(artifacts) != 1 {
		t.Fatalf("len(artifacts) = %d, want 1", len(artifacts))
	}
	if artifacts[0].Kind != "pull_request" || artifacts[0].Status != "open" {
		t.Fatalf("artifact = %#v, want pull_request/open", artifacts[0])
	}

	var got pullRequestResult
	if err := json.Unmarshal([]byte(artifacts[0].Body), &got); err != nil {
		t.Fatalf("unmarshal artifact body: %v", err)
	}
	if got != result {
		t.Fatalf("artifact body = %#v, want %#v", got, result)
	}
}

func TestMigrationBranchUsesFullRunID(t *testing.T) {
	runID := "8bb8276a-8d6d-4b02-9ea8-7d4dfc32c8af"
	want := "ferry-migration-" + runID
	if got := migrationBranch(runID); got != want {
		t.Fatalf("migrationBranch() = %q, want %q", got, want)
	}
}
