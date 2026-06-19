package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ferry/backend/internal/band"
	"github.com/gorilla/websocket"
)

func TestReconnectDelayForErrorFloorsNormalClose(t *testing.T) {
	err := fmt.Errorf("websocket read: %w", &websocket.CloseError{Code: websocket.CloseNormalClosure})

	got := reconnectDelayForError(0, err)

	if got < reconnectSupersedeDelay {
		t.Fatalf("reconnectDelayForError(0, normal close) = %s, want at least %s", got, reconnectSupersedeDelay)
	}
}

func TestReconnectAttemptAfterRunResetsOnlyAfterStableConnection(t *testing.T) {
	tests := []struct {
		name         string
		attempt      int
		connectedFor time.Duration
		want         int
	}{
		{
			name:         "short lived connection keeps attempt",
			attempt:      2,
			connectedFor: reconnectStableAfter - time.Second,
			want:         2,
		},
		{
			name:         "stable connection resets attempt",
			attempt:      2,
			connectedFor: reconnectStableAfter,
			want:         0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := reconnectAttemptAfterRun(tt.attempt, tt.connectedFor)
			if got != tt.want {
				t.Fatalf("reconnectAttemptAfterRun(%d, %s) = %d, want %d", tt.attempt, tt.connectedFor, got, tt.want)
			}
		})
	}
}

func TestCompleteStageRetriesZeroFileOutput(t *testing.T) {
	ctx := context.Background()
	var prompts []string
	responses := []string{
		"no files here",
		"```go\n// file: go.mod\nmodule example.com/app\n```",
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		for _, msg := range req.Messages {
			if msg.Role == "user" {
				prompts = append(prompts, msg.Content)
			}
		}
		i := len(prompts) - 1
		if i >= len(responses) {
			i = len(responses) - 1
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"choices":[{"message":{"role":"assistant","content":%q},"finish_reason":"stop"}]}`, responses[i])
	}))
	defer srv.Close()

	w := newTestWorker("code_generator")
	w.role = agentRoles["code_generator"]
	w.llm = NewLLM(4096)
	w.resolveLLM = func(string, int) (string, string, string) {
		return srv.URL, "test-key", "test-model"
	}

	output, err := w.completeStage(ctx, band.RunCtx{Run: "run1", Tgt: "go"}, "build files")
	if err != nil {
		t.Fatalf("completeStage returned error: %v", err)
	}
	if files := extractFiles(output); len(files) != 1 || files["go.mod"] == "" {
		t.Fatalf("output files = %#v, want go.mod", files)
	}
	if len(prompts) != 2 {
		t.Fatalf("request count = %d, want 2", len(prompts))
	}
	if !strings.Contains(prompts[1], "re-emit fenced `// file: <path>` blocks") {
		t.Fatalf("retry prompt missing file-block correction:\n%s", prompts[1])
	}
}

func TestCompleteStageFailsAfterRepeatedZeroFileOutput(t *testing.T) {
	ctx := context.Background()
	requests := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"role":"assistant","content":"still no files"},"finish_reason":"stop"}]}`)
	}))
	defer srv.Close()

	w := newTestWorker("code_generator")
	w.role = agentRoles["code_generator"]
	w.llm = NewLLM(4096)
	w.resolveLLM = func(string, int) (string, string, string) {
		return srv.URL, "test-key", "test-model"
	}

	_, err := w.completeStage(ctx, band.RunCtx{Run: "run1", Tgt: "go"}, "build files")
	if err == nil {
		t.Fatal("completeStage returned nil error")
	}
	if !strings.Contains(err.Error(), "code_generator produced no files") {
		t.Fatalf("error = %q, want code_generator produced no files", err.Error())
	}
	if requests != 3 {
		t.Fatalf("request count = %d, want 3", requests)
	}
}

func TestCompleteStageBlocksReviewerAndCommanderWithNoFiles(t *testing.T) {
	for _, key := range []string{"reviewer", "commander"} {
		t.Run(key, func(t *testing.T) {
			ctx := context.Background()
			requests := 0
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, `{"choices":[{"message":{"role":"assistant","content":"APPROVED"},"finish_reason":"stop"}]}`)
			}))
			defer srv.Close()

			w := newTestWorker(key)
			w.role = agentRoles[key]
			w.llm = NewLLM(4096)
			w.resolveLLM = func(string, int) (string, string, string) {
				return srv.URL, "test-key", "test-model"
			}

			_, err := w.completeStage(ctx, band.RunCtx{Run: "run1", Tgt: "go"}, "review")
			if err == nil {
				t.Fatal("completeStage returned nil error")
			}
			if !strings.Contains(err.Error(), "no generated files") {
				t.Fatalf("error = %q, want no generated files", err.Error())
			}
			if requests != 0 {
				t.Fatalf("model requests = %d, want 0", requests)
			}
		})
	}
}

func TestBuildPromptCapsSourceDigestOnlyForCodeGenerator(t *testing.T) {
	ctx := context.Background()
	longDigest := strings.Repeat("~", codeGeneratorSourceDigestLimit+10) + "tail"
	shortDigest := "short digest"
	runCtx := band.RunCtx{Run: "run1", User: "user1", Repo: "octo/app", Branch: "main", Src: "java", Tgt: "go"}
	msg := &band.IncomingMessage{Content: "please continue"}

	codeGen := newTestWorker("code_generator")
	codeGen.role = agentRoles["code_generator"]
	codeGen.source = &SourceProvider{cache: map[string]string{digestCacheKey(runCtx): longDigest}}
	codePrompt := codeGen.buildPrompt(ctx, msg, runCtx, "")
	if strings.Count(codePrompt, "~") != codeGeneratorSourceDigestLimit {
		t.Fatalf("code_generator digest marker count = %d, want %d", strings.Count(codePrompt, "~"), codeGeneratorSourceDigestLimit)
	}
	if strings.Contains(codePrompt, "tail") {
		t.Fatal("code_generator prompt contains uncapped digest tail")
	}

	reviewer := newTestWorker("reviewer")
	reviewer.role = agentRoles["reviewer"]
	reviewer.source = &SourceProvider{cache: map[string]string{digestCacheKey(runCtx): longDigest}}
	reviewerPrompt := reviewer.buildPrompt(ctx, msg, runCtx, "")
	if !strings.Contains(reviewerPrompt, "tail") {
		t.Fatal("reviewer prompt should keep the full digest")
	}

	codeGen.source = &SourceProvider{cache: map[string]string{digestCacheKey(runCtx): shortDigest}}
	shortPrompt := codeGen.buildPrompt(ctx, msg, runCtx, "")
	if !strings.Contains(shortPrompt, shortDigest) {
		t.Fatal("short code_generator digest should be preserved")
	}
}
