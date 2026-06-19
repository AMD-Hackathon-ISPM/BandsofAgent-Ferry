package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type PhoenixEvent struct {
	Topic   string
	Event   string
	Payload json.RawMessage
}

type reconnectHintError struct {
	err        error
	retryAfter time.Duration
}

func (e *reconnectHintError) Error() string { return e.err.Error() }

func (e *reconnectHintError) Unwrap() error { return e.err }

func (e *reconnectHintError) RetryAfter() time.Duration { return e.retryAfter }

type PhoenixClient struct {
	baseURL string
	apiKey  string
	conn    *websocket.Conn
	mu      sync.Mutex
	ref     int
	events  chan PhoenixEvent
	joinRef string
}

func NewPhoenixClient(baseURL, apiKey string) *PhoenixClient {
	return &PhoenixClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		events:  make(chan PhoenixEvent, 64),
		joinRef: "1",
	}
}

func (p *PhoenixClient) Events() <-chan PhoenixEvent { return p.events }

func (p *PhoenixClient) Connect(ctx context.Context) error {
	u, err := websocketURL(p.baseURL, p.apiKey)
	if err != nil {
		return err
	}
	conn, resp, err := websocket.DefaultDialer.DialContext(ctx, u, nil)
	if err != nil {
		return formatWebsocketDialError(resp, err)
	}
	p.conn = conn
	return nil
}

func (p *PhoenixClient) nextRef() string {
	p.ref++
	return fmt.Sprintf("%d", p.ref)
}

func (p *PhoenixClient) send(joinRef interface{}, ref, topic, event string, payload interface{}) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if payload == nil {
		payload = map[string]interface{}{}
	}
	frame := []interface{}{joinRef, ref, topic, event, payload}
	return p.conn.WriteJSON(frame)
}

func (p *PhoenixClient) Join(topic string) error {
	return p.send(p.joinRef, p.nextRef(), topic, "phx_join", map[string]interface{}{})
}

func (p *PhoenixClient) Run(ctx context.Context) error {
	defer func() {
		_ = p.conn.Close()
	}()

	hbCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-hbCtx.Done():
				return
			case <-ticker.C:
				if err := p.send(nil, p.nextRef(), "phoenix", "heartbeat", map[string]interface{}{}); err != nil {
					return
				}
			}
		}
	}()

	go func() {
		<-ctx.Done()
		_ = p.conn.Close()
	}()

	for {
		_, data, err := p.conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return fmt.Errorf("websocket read: %w", err)
		}

		var frame []json.RawMessage
		if err := json.Unmarshal(data, &frame); err != nil || len(frame) != 5 {
			continue
		}

		var topic, event string
		_ = json.Unmarshal(frame[2], &topic)
		_ = json.Unmarshal(frame[3], &event)

		switch event {
		case "phx_reply", "phx_close", "phx_error":

			if event == "phx_error" {
				log.Printf("phoenix: error on topic %s", topic)
			}
			continue
		}

		select {
		case p.events <- PhoenixEvent{Topic: topic, Event: event, Payload: frame[4]}:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func websocketURL(baseURL, apiKey string) (string, error) {
	u, err := url.Parse(strings.TrimSuffix(baseURL, "/"))
	if err != nil {
		return "", fmt.Errorf("websocket URL: parse base URL: %w", err)
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	case "http":
		u.Scheme = "ws"
	case "wss", "ws":
		// Keep as-is.
	default:
		return "", fmt.Errorf("websocket URL: unsupported base URL scheme %q", u.Scheme)
	}
	if u.Host == "" {
		return "", fmt.Errorf("websocket URL: missing host in base URL %q", baseURL)
	}
	if u.Path == "" {
		u.Path = "/socket/websocket"
	} else {
		u.Path = strings.TrimSuffix(u.Path, "/") + "/socket/websocket"
	}
	u.RawQuery = url.Values{"api_key": {apiKey}, "vsn": {"2.0.0"}}.Encode()
	return u.String(), nil
}

func formatWebsocketDialError(resp *http.Response, err error) error {
	if resp == nil {
		return fmt.Errorf("websocket dial: %w", err)
	}

	retryAfter := websocketRetryAfter(resp)
	snippet := ""
	if resp.Body != nil {
		defer resp.Body.Close()
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 512))
		if readErr == nil {
			snippet = strings.TrimSpace(string(body))
			if bodyRetryAfter, ok := retryAfterFromBody(body); ok && bodyRetryAfter > retryAfter {
				retryAfter = bodyRetryAfter
			}
		}
	}

	var baseErr error
	if snippet == "" {
		baseErr = fmt.Errorf("websocket dial: %w (HTTP %s)", err, resp.Status)
	} else {
		baseErr = fmt.Errorf("websocket dial: %w (HTTP %s: %s)", err, resp.Status, snippet)
	}
	if retryAfter > 0 {
		return &reconnectHintError{err: baseErr, retryAfter: retryAfter}
	}
	return baseErr
}

func retryAfterHint(err error) time.Duration {
	var hinted interface {
		error
		RetryAfter() time.Duration
	}
	if errors.As(err, &hinted) {
		return hinted.RetryAfter()
	}
	return 0
}

func websocketRetryAfter(resp *http.Response) time.Duration {
	if resp == nil {
		return 0
	}
	return parseRetryAfter(resp.Header.Get("Retry-After"))
}

func parseRetryAfter(raw string) time.Duration {
	if raw == "" {
		return 0
	}
	secs, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || secs <= 0 {
		return 0
	}
	return time.Duration(secs) * time.Second
}

func retryAfterFromBody(body []byte) (time.Duration, bool) {
	var payload struct {
		Error struct {
			RetryAfter int `json:"retry_after"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return 0, false
	}
	if payload.Error.RetryAfter <= 0 {
		return 0, false
	}
	return time.Duration(payload.Error.RetryAfter) * time.Second, true
}
