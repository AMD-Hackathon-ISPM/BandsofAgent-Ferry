package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLLMCompleteSendsMaxTokens(t *testing.T) {
	var got map[string]interface{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}]}`)
	}))
	defer srv.Close()

	llm := NewLLM(1234)
	res, err := llm.Complete(context.Background(), srv.URL, "test-key", "test-model", nil, "system", "user")
	if err != nil {
		t.Fatalf("Complete returned error: %v", err)
	}

	if got["max_tokens"] != float64(1234) {
		t.Fatalf("max_tokens = %v, want 1234", got["max_tokens"])
	}
	if res.Text != "ok" {
		t.Fatalf("Text = %q, want ok", res.Text)
	}
	if res.PromptBytes != len("system")+len("user") {
		t.Fatalf("PromptBytes = %d, want %d", res.PromptBytes, len("system")+len("user"))
	}
}

func TestLLMCompleteCapturesJSONFinishReasonAndUsage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"role":"assistant","content":" done "},"finish_reason":"length"}],"usage":{"prompt_tokens":7,"completion_tokens":3,"total_tokens":10}}`)
	}))
	defer srv.Close()

	llm := NewLLM(4096)
	res, err := llm.Complete(context.Background(), srv.URL, "test-key", "test-model", nil, "sys", "usr")
	if err != nil {
		t.Fatalf("Complete returned error: %v", err)
	}

	if res.Text != "done" {
		t.Fatalf("Text = %q, want done", res.Text)
	}
	if res.FinishReason != "length" {
		t.Fatalf("FinishReason = %q, want length", res.FinishReason)
	}
	if res.Usage == nil {
		t.Fatal("Usage is nil")
	}
	if res.Usage.PromptTokens != 7 || res.Usage.CompletionTokens != 3 || res.Usage.TotalTokens != 10 {
		t.Fatalf("Usage = %+v, want 7/3/10", *res.Usage)
	}
	if res.OutputBytes != len("done") {
		t.Fatalf("OutputBytes = %d, want %d", res.OutputBytes, len("done"))
	}
}

func TestLLMCompleteCapturesStreamingContentAndFinishReason(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"hel\"}}]}\n\n")
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":2,\"total_tokens\":6}}\n\n")
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	llm := NewLLM(4096)
	res, err := llm.Complete(context.Background(), srv.URL, "test-key", "test-model", nil, "sys", "usr")
	if err != nil {
		t.Fatalf("Complete returned error: %v", err)
	}

	if res.Text != "hello" {
		t.Fatalf("Text = %q, want hello", res.Text)
	}
	if res.FinishReason != "stop" {
		t.Fatalf("FinishReason = %q, want stop", res.FinishReason)
	}
	if res.Usage == nil {
		t.Fatal("Usage is nil")
	}
	if res.Usage.PromptTokens != 4 || res.Usage.CompletionTokens != 2 || res.Usage.TotalTokens != 6 {
		t.Fatalf("Usage = %+v, want 4/2/6", *res.Usage)
	}
}
