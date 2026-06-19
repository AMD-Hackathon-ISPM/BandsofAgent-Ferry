package worker

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

// LLM is a stateless OpenAI-compatible client; base URL, API key, model and the
// concurrency limiter are passed per call so one instance serves every agent,
// run slot (key), and target-specific model.
type LLM struct {
	http      *http.Client
	idle      time.Duration
	maxTokens int
}

func NewLLM(maxTokens int) *LLM {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 45 * time.Second

	return &LLM{
		http:      &http.Client{Transport: transport},
		idle:      90 * time.Second,
		maxTokens: maxTokens,
	}
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	Stream      bool          `json:"stream"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message      chatMessage `json:"message"`
		Text         string      `json:"text"`
		FinishReason string      `json:"finish_reason"`
	} `json:"choices"`
	Usage *completionUsage `json:"usage"`
}

type chatCompletionChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		Message      chatMessage `json:"message"`
		Text         string      `json:"text"`
		FinishReason string      `json:"finish_reason"`
	} `json:"choices"`
	Usage *completionUsage `json:"usage"`
}

type completionUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

type completionResult struct {
	Text         string
	FinishReason string
	Usage        *completionUsage
	PromptBytes  int
	OutputBytes  int
}

type activityReadCloser struct {
	io.ReadCloser
	notify func()
}

func (r *activityReadCloser) Read(p []byte) (int, error) {
	n, err := r.ReadCloser.Read(p)
	if n > 0 && r.notify != nil {
		r.notify()
	}
	return n, err
}

const maxLLMRetries = 5

func (l *LLM) Complete(ctx context.Context, baseURL, apiKey, model string, lim *Limiter, system, user string) (completionResult, error) {
	if lim != nil {
		if err := lim.acquire(ctx); err != nil {
			return completionResult{}, err
		}
		defer lim.release()
	}

	reqBody := chatCompletionRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		Temperature: 0.3,
		Stream:      true,
		MaxTokens:   l.maxTokens,
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return completionResult{}, fmt.Errorf("marshal: %w", err)
	}

	base := strings.TrimSuffix(baseURL, "/")
	promptBytes := len(system) + len(user)
	var lastErr error
	for attempt := 0; attempt < maxLLMRetries; attempt++ {
		res, retryAfter, err := l.do(ctx, base, apiKey, raw)
		if err == nil {
			res.PromptBytes = promptBytes
			res.OutputBytes = len(res.Text)
			return res, nil
		}
		lastErr = err
		if retryAfter <= 0 {
			return completionResult{}, err
		}

		select {
		case <-time.After(retryAfter):
		case <-ctx.Done():
			return completionResult{}, ctx.Err()
		}
	}
	return completionResult{}, fmt.Errorf("exhausted retries: %w", lastErr)
}

func (l *LLM) do(ctx context.Context, baseURL, apiKey string, raw []byte) (completionResult, time.Duration, error) {
	reqCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return completionResult{}, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "text/event-stream, application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := l.http.Do(req)
	if err != nil {
		return completionResult{}, 0, fmt.Errorf("chat/completions: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return completionResult{}, backoffFrom(resp.Header.Get("Retry-After")), fmt.Errorf("rate limited (429)")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return completionResult{}, 0, fmt.Errorf("chat/completions: status %d: %s", resp.StatusCode, string(snippet))
	}

	reader := &activityReadCloser{
		ReadCloser: resp.Body,
		notify: func() {
			// Keep the request alive while bytes continue arriving.
		},
	}

	parse := readChatCompletionJSON
	if strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		parse = readChatCompletionStream
	}

	res, err := l.readWithIdleWatch(reqCtx, cancel, reader, parse)
	if err != nil {
		return completionResult{}, 0, err
	}
	return res, 0, nil
}

func backoffFrom(retryAfter string) time.Duration {
	if retryAfter != "" {
		if secs, err := strconv.Atoi(strings.TrimSpace(retryAfter)); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return 3 * time.Second
}

func (l *LLM) readWithIdleWatch(ctx context.Context, cancel context.CancelFunc, body *activityReadCloser, parse func(io.Reader) (completionResult, error)) (completionResult, error) {
	activity := make(chan struct{}, 1)
	body.notify = func() {
		select {
		case activity <- struct{}{}:
		default:
		}
	}

	type result struct {
		res completionResult
		err error
	}

	done := make(chan result, 1)
	go func() {
		res, err := parse(body)
		done <- result{res: res, err: err}
	}()

	timer := time.NewTimer(l.idle)
	defer timer.Stop()

	for {
		select {
		case res := <-done:
			return res.res, res.err
		case <-activity:
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			timer.Reset(l.idle)
		case <-timer.C:
			cancel()
			_ = body.Close()
			return completionResult{}, fmt.Errorf("chat/completions: idle timeout after %s with no response body progress", l.idle)
		case <-ctx.Done():
			cancel()
			_ = body.Close()
			return completionResult{}, ctx.Err()
		}
	}
}

func readChatCompletionJSON(r io.Reader) (completionResult, error) {
	var out chatCompletionResponse
	if err := json.NewDecoder(r).Decode(&out); err != nil {
		return completionResult{}, fmt.Errorf("decode: %w", err)
	}
	if len(out.Choices) == 0 {
		return completionResult{}, fmt.Errorf("chat/completions: no choices returned")
	}
	choice := out.Choices[0]
	text := choice.Message.Content
	if text == "" {
		text = choice.Text
	}
	return completionResult{
		Text:         strings.TrimSpace(text),
		FinishReason: choice.FinishReason,
		Usage:        out.Usage,
	}, nil
}

func readChatCompletionStream(r io.Reader) (completionResult, error) {
	reader := bufio.NewReader(r)
	var text strings.Builder
	var event strings.Builder
	res := completionResult{}

	for {
		line, err := reader.ReadString('\n')
		if err != nil && !errors.Is(err, io.EOF) {
			return completionResult{}, fmt.Errorf("stream read: %w", err)
		}

		if line != "" {
			trimmed := strings.TrimRight(line, "\r\n")
			if trimmed == "" {
				done, eventErr := appendStreamEvent(&text, &res, event.String())
				if eventErr != nil {
					return completionResult{}, eventErr
				}
				event.Reset()
				if done {
					res.Text = strings.TrimSpace(text.String())
					return res, nil
				}
			} else if strings.HasPrefix(trimmed, "data:") {
				payload := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
				if payload != "" {
					if event.Len() > 0 {
						event.WriteByte('\n')
					}
					event.WriteString(payload)
				}
			}
		}

		if errors.Is(err, io.EOF) {
			break
		}
	}

	if event.Len() > 0 {
		done, err := appendStreamEvent(&text, &res, event.String())
		if err != nil {
			return completionResult{}, err
		}
		if done {
			res.Text = strings.TrimSpace(text.String())
			return res, nil
		}
	}

	res.Text = strings.TrimSpace(text.String())
	return res, nil
}

func appendStreamEvent(dst *strings.Builder, res *completionResult, payload string) (bool, error) {
	if payload == "" {
		return false, nil
	}
	if payload == "[DONE]" {
		return true, nil
	}

	var chunk chatCompletionChunk
	if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
		return false, fmt.Errorf("stream decode: %w", err)
	}
	if chunk.Usage != nil {
		res.Usage = chunk.Usage
	}
	for _, choice := range chunk.Choices {
		if choice.FinishReason != "" {
			res.FinishReason = choice.FinishReason
		}
		switch {
		case choice.Delta.Content != "":
			dst.WriteString(choice.Delta.Content)
		case choice.Message.Content != "":
			dst.WriteString(choice.Message.Content)
		case choice.Text != "":
			dst.WriteString(choice.Text)
		}
	}
	return false, nil
}
