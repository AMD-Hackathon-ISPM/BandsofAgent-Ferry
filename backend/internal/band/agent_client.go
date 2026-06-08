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

// AgentClient talks to the Band Agent API (/api/v1/agent) authenticated as a
// single agent via that agent's X-API-Key. The Ferry backend uses the Router
// agent's key to create the chat, add participants, and post the kickoff.
//
// (The Human API /api/v1/me would be cleaner but is gated behind an Enterprise
// plan, so we orchestrate through the Router's Agent API key instead.)
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

// APIKey returns the agent key this client authenticates with (used to open the
// matching WebSocket connection).
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

// CreateChat creates a new chat. taskID is optional (pass "" to omit). The
// acting agent is automatically a participant. Returns the Band chat id.
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

// AddParticipant adds an agent (by Band agent id) to a chat.
func (c *AgentClient) AddParticipant(ctx context.Context, chatID, participantID string) error {
	body := map[string]interface{}{
		"participant": map[string]string{"participant_id": participantID},
	}
	return c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/chats/%s/participants", chatID), body, nil)
}

// SendMessage posts a message into a chat. Band requires at least one @mention.
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

// --- Worker-side methods (agents consuming their own inbox) ----------------

// Identity is the acting agent's own profile (GET /agent/me).
type Identity struct {
	ID     string `json:"id"`
	Handle string `json:"handle"`
	Name   string `json:"name"`
}

// IncomingMessage is a message delivered to an agent (via /messages/next or WS).
type IncomingMessage struct {
	ID       string `json:"id"`
	Content  string `json:"content"`
	SenderID string `json:"sender_id"`
	Metadata struct {
		Mentions []Mention `json:"mentions"`
		Status   string    `json:"status"`
	} `json:"metadata"`
}

// Me returns the acting agent's identity (used to validate the key + get id).
func (c *AgentClient) Me(ctx context.Context) (*Identity, error) {
	var resp struct {
		Data Identity `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/me", nil, &resp); err != nil {
		return nil, err
	}
	return &resp.Data, nil
}

// ListChatIDs returns the ids of all chats the agent participates in.
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

// NextMessage returns the next unprocessed message for a chat. ok is false when
// the server returns 204 No Content (nothing to process).
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

// MarkProcessing marks a message as being processed by this agent.
func (c *AgentClient) MarkProcessing(ctx context.Context, chatID, msgID string) error {
	return c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/chats/%s/messages/%s/processing", chatID, msgID), map[string]interface{}{}, nil)
}

// MarkProcessed marks a message as successfully processed.
func (c *AgentClient) MarkProcessed(ctx context.Context, chatID, msgID string) error {
	return c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/chats/%s/messages/%s/processed", chatID, msgID), map[string]interface{}{}, nil)
}

// MarkFailed marks a message as failed; it remains available for retry.
func (c *AgentClient) MarkFailed(ctx context.Context, chatID, msgID, errMsg string) error {
	return c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/chats/%s/messages/%s/failed", chatID, msgID), map[string]string{"error": errMsg}, nil)
}

// TranscriptMessage is a message as returned by the chat transcript listing.
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

// ListMessages returns the full transcript of a chat (oldest first). A
// participant (e.g. the Router) can read every message in the room.
func (c *AgentClient) ListMessages(ctx context.Context, chatID string) ([]TranscriptMessage, error) {
	var resp struct {
		Data []TranscriptMessage `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, fmt.Sprintf("/chats/%s/messages", chatID), nil, &resp); err != nil {
		return nil, err
	}
	return resp.Data, nil
}
