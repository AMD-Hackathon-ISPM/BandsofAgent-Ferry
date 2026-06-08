package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/ferry/backend/internal/band"
)

// AgentInfo is one agent's identity used for handoff @mentions.
type AgentInfo struct {
	Key    string
	ID     string
	Handle string // no leading "@"
	Name   string
}

// Worker is a single Band-connected agent: it consumes its inbox, runs its LLM,
// and hands off to the next agent in the pipeline.
type Worker struct {
	info    AgentInfo
	role    agentRole
	client  *band.AgentClient
	llm     *LLM
	roster  map[string]AgentInfo // keyed by internal agent key (for handoff)
	joined  map[string]bool      // chat ids whose chat_room channel we've joined
}

func NewWorker(info AgentInfo, role agentRole, client *band.AgentClient, llm *LLM, roster map[string]AgentInfo) *Worker {
	return &Worker{
		info:   info,
		role:   role,
		client: client,
		llm:    llm,
		roster: roster,
		joined: make(map[string]bool),
	}
}

// Run validates the agent, drains any backlog, then connects the WebSocket and
// processes message_created events until ctx is cancelled.
func (w *Worker) Run(ctx context.Context) error {
	me, err := w.client.Me(ctx)
	if err != nil {
		return fmt.Errorf("[%s] validate key: %w", w.info.Key, err)
	}
	w.info.ID = me.ID
	if !w.llm.Configured() {
		log.Printf("[%s] WARNING: no LLM API key configured — messages will fail until the agent's source key is set", w.info.Key)
	}
	log.Printf("[%s] online as %s (%s)", w.info.Key, me.Handle, me.ID)

	// Startup synchronization: drain unprocessed messages in every known chat.
	chatIDs, err := w.client.ListChatIDs(ctx)
	if err != nil {
		log.Printf("[%s] list chats failed: %v", w.info.Key, err)
	}
	for _, chatID := range chatIDs {
		w.drain(ctx, chatID)
	}

	// Connect WebSocket and subscribe.
	px := NewPhoenixClient(w.client.APIKey())
	if err := px.Connect(ctx); err != nil {
		return fmt.Errorf("[%s] %w", w.info.Key, err)
	}
	if err := px.Join("agent_rooms:" + w.info.ID); err != nil {
		log.Printf("[%s] join agent_rooms failed: %v", w.info.Key, err)
	}
	for _, chatID := range chatIDs {
		if err := px.Join("chat_room:" + chatID); err == nil {
			w.joined[chatID] = true
		}
	}

	go w.dispatch(ctx, px)
	return px.Run(ctx)
}

// dispatch routes inbound Phoenix events.
func (w *Worker) dispatch(ctx context.Context, px *PhoenixClient) {
	for {
		select {
		case <-ctx.Done():
			return
		case ev := <-px.Events():
			switch ev.Event {
			case "message_created":
				roomID := strings.TrimPrefix(ev.Topic, "chat_room:")
				var msg band.IncomingMessage
				if err := json.Unmarshal(ev.Payload, &msg); err != nil {
					continue
				}
				w.handle(ctx, roomID, &msg)
			case "room_added":
				if id := extractRoomID(ev.Payload); id != "" && !w.joined[id] {
					if err := px.Join("chat_room:" + id); err == nil {
						w.joined[id] = true
						w.drain(ctx, id) // catch the message that prompted the add
					}
				}
			}
		}
	}
}

// drain processes currently-unprocessed messages in a chat (startup sync).
// /messages/next also re-returns failed/processing messages, so we track the
// ids we've already attempted this pass and stop once one repeats — otherwise a
// message that fails (e.g. LLM error) would loop forever.
func (w *Worker) drain(ctx context.Context, chatID string) {
	attempted := make(map[string]bool)
	for {
		if ctx.Err() != nil {
			return
		}
		msg, ok, err := w.client.NextMessage(ctx, chatID)
		if err != nil {
			log.Printf("[%s] next message (%s): %v", w.info.Key, chatID, err)
			return
		}
		if !ok {
			return // 204: nothing left
		}
		if attempted[msg.ID] {
			return // same message came back (failed/stuck) — stop this pass
		}
		attempted[msg.ID] = true
		w.handle(ctx, chatID, msg)
	}
}

// handle runs the full processing workflow for one message.
func (w *Worker) handle(ctx context.Context, chatID string, msg *band.IncomingMessage) {
	if err := w.client.MarkProcessing(ctx, chatID, msg.ID); err != nil {
		log.Printf("[%s] mark processing failed: %v", w.info.Key, err)
		return
	}

	prompt := w.buildPrompt(msg)
	output, err := w.llm.Complete(ctx, w.role.system, prompt)
	if err != nil {
		log.Printf("[%s] llm failed: %v", w.info.Key, err)
		_ = w.client.MarkFailed(ctx, chatID, msg.ID, err.Error())
		return
	}

	// Hand off to the next agent (terminal agents post nothing).
	if next, ok := w.roster[w.role.next]; ok && w.role.next != "" {
		content := fmt.Sprintf("%s\n\n@%s — please continue.", output, next.Handle)
		mentions := []band.Mention{{ID: next.ID, Name: next.Name, Handle: next.Handle}}
		if _, err := w.client.SendMessage(ctx, chatID, content, mentions); err != nil {
			log.Printf("[%s] handoff to %s failed: %v", w.info.Key, next.Handle, err)
			_ = w.client.MarkFailed(ctx, chatID, msg.ID, err.Error())
			return
		}
		log.Printf("[%s] processed → handed off to %s", w.info.Key, next.Key)
	} else {
		log.Printf("[%s] processed (terminal)", w.info.Key)
	}

	if err := w.client.MarkProcessed(ctx, chatID, msg.ID); err != nil {
		log.Printf("[%s] mark processed failed: %v", w.info.Key, err)
	}
}

// buildPrompt renders the user prompt from the incoming message, replacing the
// @[[id]] mention tokens Band stores with readable @Name references.
func (w *Worker) buildPrompt(msg *band.IncomingMessage) string {
	content := msg.Content
	for _, m := range msg.Metadata.Mentions {
		content = strings.ReplaceAll(content, "@[["+m.ID+"]]", "@"+m.Name)
	}
	return fmt.Sprintf("A message addressed to you in the migration band:\n\n%s\n\nProduce your contribution for this stage. Be concise and structured.", content)
}

func extractRoomID(payload json.RawMessage) string {
	var m map[string]interface{}
	if err := json.Unmarshal(payload, &m); err != nil {
		return ""
	}
	for _, k := range []string{"id", "room_id", "chat_id"} {
		if v, ok := m[k].(string); ok && v != "" {
			return v
		}
	}
	return ""
}
