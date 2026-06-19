package worker

import (
	"strings"
	"testing"
)

func TestParseConsultRequestValid(t *testing.T) {
	content := `[ferry-consult]{"agent":"db_migration","question":"What schema constraints matter here?","context":"Generated SQL mentions users and orders."}[/ferry-consult]`

	req, present, err := parseConsultRequest(content)
	if err != nil {
		t.Fatalf("parseConsultRequest: %v", err)
	}
	if !present {
		t.Fatal("expected consult request to be present")
	}
	if req.Agent != "db_migration" {
		t.Fatalf("unexpected agent: %q", req.Agent)
	}
	if !strings.Contains(req.Question, "schema constraints") {
		t.Fatalf("unexpected question: %q", req.Question)
	}
}

func TestParseConsultRequestRejectsUnknownAgent(t *testing.T) {
	content := `[ferry-consult]{"agent":"router","question":"route this"}[/ferry-consult]`

	_, present, err := parseConsultRequest(content)
	if !present {
		t.Fatal("expected consult request to be present")
	}
	if err == nil || !strings.Contains(err.Error(), "not consultable") {
		t.Fatalf("expected consultable-agent validation error, got %v", err)
	}
}

func TestParseConsultRequestRequiresQuestion(t *testing.T) {
	content := `[ferry-consult]{"agent":"reviewer","question":"   "}[/ferry-consult]`

	_, present, err := parseConsultRequest(content)
	if !present {
		t.Fatal("expected consult request to be present")
	}
	if err == nil || !strings.Contains(err.Error(), "question is required") {
		t.Fatalf("expected missing question error, got %v", err)
	}
}
