package worker

import (
	"bufio"
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
		http:    &http.Client{Timeout: 240 * time.Second},
		limiter: limiter,
	}
}

func (l *LLM) Configured() bool { return l.apiKey != "" }

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

const maxLLMRetries = 5

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
			return "", err
		}

		select {
		case <-time.After(retryAfter):
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	return "", fmt.Errorf("exhausted retries: %w", lastErr)
}

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

func backoffFrom(retryAfter string) time.Duration {
	if retryAfter != "" {
		if secs, err := strconv.Atoi(strings.TrimSpace(retryAfter)); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return 3 * time.Second
}
