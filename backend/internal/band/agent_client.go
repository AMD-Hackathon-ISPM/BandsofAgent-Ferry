package band

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type AgentClient struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func NewAgentClient(baseURL, apiKey string) *AgentClient {
	return &AgentClient{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		apiKey:  apiKey,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *AgentClient) APIKey() string { return c.apiKey }

type Mention struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Handle string `json:"handle"`
}

type dataEnvelope struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}

func (c *AgentClient) doJSON(ctx context.Context, method, path string, body, out interface{}) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("%s %s: status %d: %s", method, path, resp.StatusCode, string(snippet))
	}

	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil && err != io.EOF {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}

func (c *AgentClient) CreateChat(ctx context.Context, taskID string) (string, error) {
	chat := map[string]interface{}{}
	if taskID != "" {
		chat["task_id"] = taskID
	}
	var resp dataEnvelope
	if err := c.doJSON(ctx, http.MethodPost, "/chats", map[string]interface{}{"chat": chat}, &resp); err != nil {
		return "", err
	}
	return resp.Data.ID, nil
}

func (c *AgentClient) AddParticipant(ctx context.Context, chatID, participantID string) error {
	body := map[string]interface{}{
		"participant": map[string]string{"participant_id": participantID},
	}
	return c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/chats/%s/participants", chatID), body, nil)
}

func (c *AgentClient) SendMessage(ctx context.Context, chatID, content string, mentions []Mention) (string, error) {
	body := map[string]interface{}{
		"message": map[string]interface{}{
			"content":  content,
			"mentions": mentions,
		},
	}
	var resp dataEnvelope
	if err := c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/chats/%s/messages", chatID), body, &resp); err != nil {
		return "", err
	}
	return resp.Data.ID, nil
}

type Identity struct {
	ID     string `json:"id"`
	Handle string `json:"handle"`
	Name   string `json:"name"`
}

type IncomingMessage struct {
	ID       string `json:"id"`
	Content  string `json:"content"`
	SenderID string `json:"sender_id"`
	Metadata struct {
		Mentions []Mention `json:"mentions"`
		Status   string    `json:"status"`
	} `json:"metadata"`
}

func (c *AgentClient) Me(ctx context.Context) (*Identity, error) {
	var resp struct {
		Data Identity `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/me", nil, &resp); err != nil {
		return nil, err
	}
	return &resp.Data, nil
}

func (c *AgentClient) ListChatIDs(ctx context.Context) ([]string, error) {
	var resp struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/chats", nil, &resp); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(resp.Data))
	for _, c := range resp.Data {
		ids = append(ids, c.ID)
	}
	return ids, nil
}

func (c *AgentClient) NextMessage(ctx context.Context, chatID string) (msg *IncomingMessage, ok bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+fmt.Sprintf("/chats/%s/messages/next", chatID), nil)
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNoContent {
		return nil, false, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, false, fmt.Errorf("messages/next: status %d: %s", resp.StatusCode, string(snippet))
	}

	var env struct {
		Data IncomingMessage `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, false, fmt.Errorf("decode messages/next: %w", err)
	}
	return &env.Data, true, nil
}

func (c *AgentClient) MarkProcessing(ctx context.Context, chatID, msgID string) error {
	return c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/chats/%s/messages/%s/processing", chatID, msgID), map[string]interface{}{}, nil)
}

func (c *AgentClient) MarkProcessed(ctx context.Context, chatID, msgID string) error {
	return c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/chats/%s/messages/%s/processed", chatID, msgID), map[string]interface{}{}, nil)
}

func (c *AgentClient) MarkFailed(ctx context.Context, chatID, msgID, errMsg string) error {
	return c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/chats/%s/messages/%s/failed", chatID, msgID), map[string]string{"error": errMsg}, nil)
}

type TranscriptMessage struct {
	ID         string `json:"id"`
	Content    string `json:"content"`
	SenderID   string `json:"sender_id"`
	SenderName string `json:"sender_name"`
	SenderType string `json:"sender_type"`
	InsertedAt string `json:"inserted_at"`
	Metadata   struct {
		Mentions []Mention `json:"mentions"`
	} `json:"metadata"`
}

func (c *AgentClient) ListMessages(ctx context.Context, chatID string) ([]TranscriptMessage, error) {
	var resp struct {
		Data []TranscriptMessage `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, fmt.Sprintf("/chats/%s/messages", chatID), nil, &resp); err != nil {
		return nil, err
	}
	return resp.Data, nil
}
