package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Limiter is a counting semaphore bounding concurrent LLM requests across all
// agents. Providers like Featherless cap concurrency per plan (e.g. the
// reasoning model allows only 2 concurrent requests), so without this the
// agents would trip 429 "concurrency limit exceeded".
type Limiter struct {
	ch chan struct{}
}

func NewLimiter(n int) *Limiter {
	if n < 1 {
		n = 1
	}
	return &Limiter{ch: make(chan struct{}, n)}
}

func (l *Limiter) acquire(ctx context.Context) error {
	select {
	case l.ch <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (l *Limiter) release() { <-l.ch }

// LLM is a minimal OpenAI-compatible chat-completions client. Each agent gets
// its own LLM bound to its configured model + source (aimlapi / featherless),
// per the AGENT_<NAME>_MODEL / _SOURCE configuration. All LLMs share a Limiter.
type LLM struct {
	baseURL string
	apiKey  string
	model   string
	http    *http.Client
	limiter *Limiter
}

func NewLLM(baseURL, apiKey, model string, limiter *Limiter) *LLM {
	return &LLM{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		apiKey:  apiKey,
		model:   model,
		http:    &http.Client{Timeout: 120 * time.Second},
		limiter: limiter,
	}
}

// Configured reports whether this LLM has an API key set.
func (l *LLM) Configured() bool { return l.apiKey != "" }

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

const maxLLMRetries = 5

// Complete runs a single chat completion and returns the assistant text. It
// bounds concurrency via the shared Limiter and retries on 429 with backoff.
func (l *LLM) Complete(ctx context.Context, system, user string) (string, error) {
	if l.limiter != nil {
		if err := l.limiter.acquire(ctx); err != nil {
			return "", err
		}
		defer l.limiter.release()
	}

	reqBody := map[string]interface{}{
		"model": l.model,
		"messages": []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		"temperature": 0.3,
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt < maxLLMRetries; attempt++ {
		text, retryAfter, err := l.do(ctx, raw)
		if err == nil {
			return text, nil
		}
		lastErr = err
		if retryAfter <= 0 {
			return "", err // non-retryable
		}
		// Wait out the rate limit (respecting ctx).
		select {
		case <-time.After(retryAfter):
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	return "", fmt.Errorf("exhausted retries: %w", lastErr)
}

// do performs one request. On HTTP 429 it returns a positive retryAfter so the
// caller backs off and retries; other errors return retryAfter == 0.
func (l *LLM) do(ctx context.Context, raw []byte) (text string, retryAfter time.Duration, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, l.baseURL+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Authorization", "Bearer "+l.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := l.http.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("chat/completions: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return "", backoffFrom(resp.Header.Get("Retry-After")), fmt.Errorf("rate limited (429)")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", 0, fmt.Errorf("chat/completions: status %d: %s", resp.StatusCode, string(snippet))
	}

	var out struct {
		Choices []struct {
			Message chatMessage `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", 0, fmt.Errorf("decode: %w", err)
	}
	if len(out.Choices) == 0 {
		return "", 0, fmt.Errorf("chat/completions: no choices returned")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), 0, nil
}

// backoffFrom returns how long to wait before retrying a 429: the Retry-After
// header if present, otherwise a fixed 3s pause.
func backoffFrom(retryAfter string) time.Duration {
	if retryAfter != "" {
		if secs, err := strconv.Atoi(strings.TrimSpace(retryAfter)); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return 3 * time.Second
}
