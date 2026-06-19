package bandmirror

import (
	"strings"
	"testing"

	"github.com/ferry/backend/internal/band"
)

func TestNormalizeDBPlanForPersistenceRequiresSQLAndSchemas(t *testing.T) {
	plan := band.DBPlan{
		RiskLevel:        "high",
		RequiresDowntime: true,
		EstimatedSeconds: 30,
		RiskFactors:      []string{" lock wait ", ""},
		MigrationSQL:     "ALTER TABLE accounts ENGINE=InnoDB;",
		RollbackSQL:      "ALTER TABLE accounts ENGINE=MyISAM;",
		SourceSchema:     "CREATE TABLE accounts (id INT) ENGINE=MyISAM;",
		TargetSchema:     "CREATE TABLE accounts (id INT) ENGINE=InnoDB;",
		ValidationSQL:    " CHECK TABLE accounts; ",
	}

	got, ok := normalizeDBPlanForPersistence(plan)
	if !ok {
		t.Fatal("normalizeDBPlanForPersistence() ok = false, want true")
	}
	if got.RiskLevel != "high" {
		t.Fatalf("RiskLevel = %q, want high", got.RiskLevel)
	}
	if got.ValidationSQL == nil || *got.ValidationSQL != "CHECK TABLE accounts;" {
		t.Fatalf("ValidationSQL = %#v, want trimmed value", got.ValidationSQL)
	}
	if len(got.RiskFactors) != 1 || got.RiskFactors[0] != "lock wait" {
		t.Fatalf("RiskFactors = %#v, want trimmed non-empty values", got.RiskFactors)
	}

	for _, tt := range []struct {
		name string
		edit func(*band.DBPlan)
	}{
		{name: "missing source schema", edit: func(p *band.DBPlan) { p.SourceSchema = "" }},
		{name: "missing target schema", edit: func(p *band.DBPlan) { p.TargetSchema = "" }},
		{name: "missing migration sql", edit: func(p *band.DBPlan) { p.MigrationSQL = "" }},
		{name: "missing rollback sql", edit: func(p *band.DBPlan) { p.RollbackSQL = "" }},
		{name: "invalid risk level", edit: func(p *band.DBPlan) { p.RiskLevel = "severe" }},
	} {
		t.Run(tt.name, func(t *testing.T) {
			p := plan
			tt.edit(&p)
			if _, ok := normalizeDBPlanForPersistence(p); ok {
				t.Fatal("normalizeDBPlanForPersistence() ok = true, want false")
			}
		})
	}
}

func TestParsePullRequestArtifactBody(t *testing.T) {
	body := `{"url":"https://github.com/acme/app/pull/42","number":42,"title":"Ferry migration","sourceBranch":"ferry-migration-12345678","targetBranch":"main"}`

	got, ok := parsePullRequestArtifact(body)
	if !ok {
		t.Fatal("parsePullRequestArtifact() ok = false, want true")
	}
	if got.URL != "https://github.com/acme/app/pull/42" || got.Number != 42 || got.TargetBranch != "main" {
		t.Fatalf("parsePullRequestArtifact() = %#v", got)
	}

	if _, ok := parsePullRequestArtifact(`{"url":"","number":0}`); ok {
		t.Fatal("parsePullRequestArtifact() accepted incomplete body")
	}
}

func TestTerminalStatusFromArtifacts(t *testing.T) {
	status, msg, ok := terminalStatusFromArtifacts([]band.Artifact{
		{Kind: "pull_request", Status: "failed", Body: " github 403 "},
	})
	if !ok || status != "failed" || msg != "github 403" {
		t.Fatalf("terminalStatusFromArtifacts() = %q, %q, %v; want failed, trimmed message, true", status, msg, ok)
	}

	status, msg, ok = terminalStatusFromArtifacts([]band.Artifact{
		{Kind: "pull_request", Status: "open", Body: "{}"},
	})
	if !ok || status != "completed" || msg != "" {
		t.Fatalf("terminalStatusFromArtifacts() = %q, %q, %v; want completed, empty message, true", status, msg, ok)
	}

	if _, _, ok := terminalStatusFromArtifacts([]band.Artifact{{Kind: "build", Status: "failed"}}); ok {
		t.Fatal("terminalStatusFromArtifacts() ok = true, want false")
	}
}

func TestOutputUpsertsUseRunConflictKey(t *testing.T) {
	for name, query := range map[string]string{
		"pull request": pullRequestUpsertSQL,
		"db plan":      dbPlanUpsertSQL,
	} {
		t.Run(name, func(t *testing.T) {
			if !strings.Contains(query, "ON CONFLICT (company_id, migration_run_id) DO UPDATE") {
				t.Fatalf("upsert query does not use run conflict key:\n%s", query)
			}
		})
	}
}
