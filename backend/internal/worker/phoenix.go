package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// PhoenixEvent is a decoded inbound channel event.
type PhoenixEvent struct {
	Topic   string
	Event   string
	Payload json.RawMessage
}

// PhoenixClient is a minimal Phoenix Channels (vsn 2.0.0) client over a single
// WebSocket. Frames are arrays: [join_ref, ref, topic, event, payload].
type PhoenixClient struct {
	apiKey  string
	conn    *websocket.Conn
	mu      sync.Mutex // guards writes + ref counter
	ref     int
	events  chan PhoenixEvent
	joinRef string
}

func NewPhoenixClient(apiKey string) *PhoenixClient {
	return &PhoenixClient{
		apiKey:  apiKey,
		events:  make(chan PhoenixEvent, 64),
		joinRef: "1",
	}
}

// Events returns the channel of inbound events (message_created, room_added, …).
func (p *PhoenixClient) Events() <-chan PhoenixEvent { return p.events }

// Connect dials the Band WebSocket with the agent api_key.
func (p *PhoenixClient) Connect(ctx context.Context) error {
	u := url.URL{
		Scheme:   "wss",
		Host:     "app.band.ai",
		Path:     "/api/v1/socket/websocket",
		RawQuery: url.Values{"api_key": {p.apiKey}, "vsn": {"2.0.0"}}.Encode(),
	}
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("websocket dial: %w", err)
	}
	p.conn = conn
	return nil
}

func (p *PhoenixClient) nextRef() string {
	p.ref++
	return fmt.Sprintf("%d", p.ref)
}

// send writes a Phoenix frame [join_ref, ref, topic, event, payload].
func (p *PhoenixClient) send(joinRef interface{}, ref, topic, event string, payload interface{}) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if payload == nil {
		payload = map[string]interface{}{}
	}
	frame := []interface{}{joinRef, ref, topic, event, payload}
	return p.conn.WriteJSON(frame)
}

// Join joins a channel topic (e.g. "chat_room:{id}" or "agent_rooms:{id}").
func (p *PhoenixClient) Join(topic string) error {
	return p.send(p.joinRef, p.nextRef(), topic, "phx_join", map[string]interface{}{})
}

// Run starts the heartbeat + read loops, blocking until ctx is done or the
// connection drops. Decoded events are pushed to Events().
func (p *PhoenixClient) Run(ctx context.Context) error {
	defer p.conn.Close()

	// Heartbeat every 30s (server closes after 45s of silence).
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

	// Close the connection when ctx is cancelled so ReadMessage unblocks.
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
			continue // ignore malformed frames
		}

		var topic, event string
		_ = json.Unmarshal(frame[2], &topic)
		_ = json.Unmarshal(frame[3], &event)

		switch event {
		case "phx_reply", "phx_close", "phx_error":
			// join acks / lifecycle — log reply errors, otherwise ignore
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
