package band

import (
	"reflect"
	"testing"
)

func TestDBPlanRoundTrip(t *testing.T) {
	plan := DBPlan{
		RiskLevel:        "high",
		RequiresDowntime: true,
		EstimatedSeconds: 90,
		RiskFactors:      []string{"large table copy", "metadata lock"},
		MigrationSQL:     "ALTER TABLE accounts ENGINE=InnoDB;",
		RollbackSQL:      "ALTER TABLE accounts ENGINE=MyISAM;",
		SourceSchema:     "CREATE TABLE accounts (id INT) ENGINE=MyISAM;",
		TargetSchema:     "CREATE TABLE accounts (id INT) ENGINE=InnoDB;",
		ValidationSQL:    "CHECK TABLE accounts;",
	}

	content := "summary\n\n" + MarshalDBPlan(plan) + "\n\nnext"
	got, cleaned, ok := ParseDBPlan(content)
	if !ok {
		t.Fatal("ParseDBPlan() ok = false, want true")
	}
	if !reflect.DeepEqual(got, plan) {
		t.Fatalf("ParseDBPlan() = %#v, want %#v", got, plan)
	}
	if cleaned != "summary\n\nnext" {
		t.Fatalf("cleaned content = %q, want %q", cleaned, "summary\n\nnext")
	}
}

func TestParseDBPlanIgnoresInvalidJSON(t *testing.T) {
	_, cleaned, ok := ParseDBPlan("before\n[ferry-dbplan]{not json}[/ferry-dbplan]\nafter")
	if ok {
		t.Fatal("ParseDBPlan() ok = true, want false")
	}
	if cleaned != "before\n[ferry-dbplan]{not json}[/ferry-dbplan]\nafter" {
		t.Fatalf("cleaned content changed to %q", cleaned)
	}
}
