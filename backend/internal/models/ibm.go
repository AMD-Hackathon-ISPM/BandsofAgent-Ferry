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

type IBMClient struct {
	endpoint   string
	apiKey     string
	httpClient *http.Client
	model      string
}

func NewIBMClient(endpoint, apiKey, model string) *IBMClient {
	return &IBMClient{
		endpoint: endpoint,
		apiKey:   apiKey,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
		model: model,
	}
}

type ibmRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
	Stream      bool      `json:"stream"`
}

type ibmResponse struct {
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
	Usage struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage"`
}

func (c *IBMClient) Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	return nil, fmt.Errorf("completion is not implemented for IBM client")
}

func (c *IBMClient) Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	body, err := json.Marshal(ibmRequest{
		Model:       c.model,
		Messages:    req.Messages,
		Temperature: req.Temperature,
		MaxTokens:   req.MaxTokens,
		Stream:      false,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		request.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(response.Body)
		return nil, fmt.Errorf("API error (status %d): %s", response.StatusCode, string(bodyBytes))
	}

	var ibmResp ibmResponse
	if err := json.NewDecoder(response.Body).Decode(&ibmResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(ibmResp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}

	return &ChatResponse{
		Message:      ibmResp.Choices[0].Message,
		FinishReason: "stop",
		TokensUsed:   ibmResp.Usage.TotalTokens,
	}, nil
}

func (c *IBMClient) Name() string {
	return "ibm"
}
