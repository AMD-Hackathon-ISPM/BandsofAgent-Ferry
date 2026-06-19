package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/ferry/backend/internal/band"
)

var consultRe = regexp.MustCompile(`(?s)\[ferry-consult\]\s*(.*?)\s*\[/ferry-consult\]`)

var consultableAgents = map[string]bool{
	"source_analyzer": true,
	"business_logic":  true,
	"code_generator":  true,
	"db_migration":    true,
	"test_generator":  true,
	"reviewer":        true,
	"commander":       true,
}

type consultRequest struct {
	Agent    string `json:"agent"`
	Question string `json:"question"`
	Context  string `json:"context,omitempty"`
}

func parseConsultRequest(content string) (consultRequest, bool, error) {
	m := consultRe.FindStringSubmatch(content)
	if m == nil {
		return consultRequest{}, false, nil
	}
	var req consultRequest
	if err := json.Unmarshal([]byte(strings.TrimSpace(m[1])), &req); err != nil {
		return consultRequest{}, true, fmt.Errorf("invalid ferry-consult JSON: %w", err)
	}
	if err := validateConsultRequest(req); err != nil {
		return consultRequest{}, true, err
	}
	return req, true, nil
}

func validateConsultRequest(req consultRequest) error {
	if !consultableAgents[req.Agent] {
		return fmt.Errorf("agent %q is not consultable", req.Agent)
	}
	if strings.TrimSpace(req.Question) == "" {
		return fmt.Errorf("ferry-consult question is required")
	}
	if len(req.Question) > 1500 {
		return fmt.Errorf("ferry-consult question is too long")
	}
	if len(req.Context) > 3000 {
		return fmt.Errorf("ferry-consult context is too long")
	}
	return nil
}

func (w *Worker) runConsult(ctx context.Context, runCtx band.RunCtx, req consultRequest) (string, error) {
	if req.Agent == w.info.Key {
		return "", fmt.Errorf("cannot consult the current agent (%s)", req.Agent)
	}
	role, ok := agentRoles[req.Agent]
	if !ok {
		return "", fmt.Errorf("unknown consult agent %q", req.Agent)
	}
	if w.resolveAnyLLM == nil {
		return "", fmt.Errorf("cross-agent model resolution is unavailable")
	}

	base, key, model := w.resolveAnyLLM(req.Agent, runCtx.Tgt, runCtx.Slot)
	if key == "" || model == "" {
		return "", fmt.Errorf("consult agent %q is not configured with a model", req.Agent)
	}

	consultant := req.Agent
	if info, ok := w.roster[req.Agent]; ok && info.Name != "" {
		consultant = info.Name
	}

	system := role.system + "\nThis is a side consultation from another Ferry agent during an active migration run. Answer the question directly and concisely. Do not hand off. Do not emit ferry-consult, ferry-repoexec, file blocks, or @mentions unless the question explicitly requires a literal block example."
	user := w.buildConsultPrompt(ctx, runCtx, req)

	answer, err := w.llm.Complete(ctx, base, key, model, w.limiterForSlot(runCtx.Slot), system, user)
	if err != nil {
		return "", err
	}

	var b strings.Builder
	fmt.Fprintf(&b, "CONSULT RESULT FROM %s:\n", consultant)
	b.WriteString(strings.TrimSpace(answer))
	return b.String(), nil
}

func (w *Worker) buildConsultPrompt(ctx context.Context, runCtx band.RunCtx, req consultRequest) string {
	var b strings.Builder
	fmt.Fprintf(&b, "You are answering a side consultation for the active stage owned by %s.\n\n", w.info.Name)
	if runCtx.Src != "" && runCtx.Tgt != "" {
		fmt.Fprintf(&b, "MIGRATION TARGET LANGUAGE: %s (migrating FROM %s).\n\n", runCtx.Tgt, runCtx.Src)
	}
	if req.Context != "" {
		fmt.Fprintf(&b, "Requester context:\n%s\n\n---\n\n", strings.TrimSpace(req.Context))
	}
	if role, ok := agentRoles[req.Agent]; ok {
		docs := w.loadDocs(ctx, runCtx.Run, role.docsIn...)
		for _, name := range role.docsIn {
			if body := docs[name]; body != "" {
				fmt.Fprintf(&b, "%s (from the migration pipeline):\n\n%s\n\n---\n\n", name, body)
			}
		}
		if role.needsSource && w.source != nil {
			if digest := w.source.Digest(ctx, runCtx); digest != "" {
				b.WriteString("REPOSITORY SOURCE (real code snapshot):\n\n")
				b.WriteString(digest)
				b.WriteString("\n\n---\n\n")
			}
		}
	}
	fmt.Fprintf(&b, "Question from %s to %s:\n\n%s\n\nAnswer only this consultation. Be concrete and concise.", w.info.Name, req.Agent, strings.TrimSpace(req.Question))
	return b.String()
}
