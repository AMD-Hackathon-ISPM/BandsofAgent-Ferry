package migrations

import (
	"strings"
	"testing"
)

func TestOutputUniqueMigrationAddsRunUniqueIndexes(t *testing.T) {
	raw, err := FS.ReadFile("000004_output_unique.up.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	sql := strings.ToLower(string(raw))

	for _, want := range []string{
		"create unique index if not exists idx_pull_requests_run_unique on pull_requests (company_id, migration_run_id)",
		"create unique index if not exists idx_db_plans_run_unique on db_migration_plans (company_id, migration_run_id)",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("migration missing %q", want)
		}
	}
}
