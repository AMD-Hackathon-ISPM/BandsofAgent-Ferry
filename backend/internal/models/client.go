package models

import (
	"context"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type CompletionRequest struct {
	Prompt      string   `json:"prompt"`
	Temperature float64  `json:"temperature,omitempty"`
	MaxTokens   int      `json:"max_tokens,omitempty"`
	StopWords   []string `json:"stop_words,omitempty"`
}

type CompletionResponse struct {
	Text         string `json:"text"`
	FinishReason string `json:"finish_reason"`
	TokensUsed   int    `json:"tokens_used"`
}

type ChatRequest struct {
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
	StopWords   []string  `json:"stop_words,omitempty"`
}

type ChatResponse struct {
	Message      Message `json:"message"`
	FinishReason string  `json:"finish_reason"`
	TokensUsed   int     `json:"tokens_used"`
}

type GenerateRequest struct {
	SystemPrompt string   `json:"system_prompt"`
	Prompt       string   `json:"prompt"`
	Temperature  float64  `json:"temperature,omitempty"`
	MaxTokens    int      `json:"max_tokens,omitempty"`
	StopWords    []string `json:"stop_words,omitempty"`
}

type GenerateResponse struct {
	Text   string `json:"text"`
	Tokens int    `json:"tokens"`
}

type Client interface {
	Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error)
	Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error)
	Name() string
}
