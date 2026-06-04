package models

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type AIMLClient struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
	model      string
}

func NewAIMLClient(apiKey, model string) *AIMLClient {
	if model == "" {
		model = "gpt-4o-mini"
	}

	return &AIMLClient{
		apiKey:  apiKey,
		baseURL: "https://api.aimlapi.com/v1",
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
		model: model,
	}
}

type aimlRequest struct {
	Model       string        `json:"model"`
	Messages    []aimlMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Stream      bool          `json:"stream"`
}

type aimlMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type aimlResponse struct {
	ID      string       `json:"id"`
	Object  string       `json:"object"`
	Created int64        `json:"created"`
	Model   string       `json:"model"`
	Choices []aimlChoice `json:"choices"`
	Usage   aimlUsage    `json:"usage"`
}

type aimlChoice struct {
	Index        int         `json:"index"`
	Message      aimlMessage `json:"message"`
	FinishReason string      `json:"finish_reason"`
}

type aimlUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

func (c *AIMLClient) Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	messages := []aimlMessage{
		{
			Role:    "system",
			Content: req.SystemPrompt,
		},
		{
			Role:    "user",
			Content: req.Prompt,
		},
	}

	aimlReq := aimlRequest{
		Model:       c.model,
		Messages:    messages,
		Temperature: 0.7,
		MaxTokens:   req.MaxTokens,
		Stream:      false,
	}

	body, err := json.Marshal(aimlReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var aimlResp aimlResponse
	if err := json.NewDecoder(resp.Body).Decode(&aimlResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(aimlResp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}

	return &GenerateResponse{
		Text:   aimlResp.Choices[0].Message.Content,
		Tokens: aimlResp.Usage.TotalTokens,
	}, nil
}

func (c *AIMLClient) Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	generateResponse, err := c.Generate(ctx, GenerateRequest{
		Prompt:      req.Prompt,
		Temperature: req.Temperature,
		MaxTokens:   req.MaxTokens,
		StopWords:   req.StopWords,
	})
	if err != nil {
		return nil, err
	}

	return &CompletionResponse{
		Text:         generateResponse.Text,
		FinishReason: "stop",
		TokensUsed:   generateResponse.Tokens,
	}, nil
}

func (c *AIMLClient) Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	if len(req.Messages) == 0 {
		return nil, fmt.Errorf("chat request requires at least one message")
	}

	generateResponse, err := c.Generate(ctx, GenerateRequest{
		Prompt:      req.Messages[len(req.Messages)-1].Content,
		Temperature: req.Temperature,
		MaxTokens:   req.MaxTokens,
		StopWords:   req.StopWords,
	})
	if err != nil {
		return nil, err
	}

	return &ChatResponse{
		Message: Message{
			Role:    "assistant",
			Content: generateResponse.Text,
		},
		FinishReason: "stop",
		TokensUsed:   generateResponse.Tokens,
	}, nil
}

func (c *AIMLClient) Name() string {
	return "aiml"
}
