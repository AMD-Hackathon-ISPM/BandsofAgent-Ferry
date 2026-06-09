package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/ferry/backend/internal/band"
	"github.com/redis/go-redis/v9"
)

type AgentInfo struct {
	Key    string
	ID     string
	Handle string
	Name   string
}

type Worker struct {
	info        AgentInfo
	role        agentRole
	client      *band.AgentClient
	llm         *LLM
	source      *SourceProvider
	execEnabled bool
	runnerURL   string
	bandBaseURL string
	roster      map[string]AgentInfo
	rdb         *redis.Client
	keyByID     map[string]string

	mu      sync.Mutex
	joined  map[string]bool
	handled map[string]bool
}

func NewWorker(info AgentInfo, role agentRole, client *band.AgentClient, llm *LLM, source *SourceProvider, execEnabled bool, runnerURL, bandBaseURL string, roster map[string]AgentInfo, rdb *redis.Client, keyByID map[string]string) *Worker {
	return &Worker{
		info:        info,
		role:        role,
		client:      client,
		llm:         llm,
		source:      source,
		execEnabled: execEnabled,
		runnerURL:   runnerURL,
		bandBaseURL: bandBaseURL,
		roster:      roster,
		rdb:         rdb,
		keyByID:     keyByID,
		joined:      make(map[string]bool),
		handled:     make(map[string]bool),
	}
}

// claim returns false if this message id was already handled (by the startup/
// room drain or a WebSocket event), preventing duplicate processing.
func (w *Worker) claim(msgID string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.handled[msgID] {
		return false
	}
	w.handled[msgID] = true
	return true
}

// markJoined returns false if this chat's channel was already known.
func (w *Worker) markJoined(chatID string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.joined[chatID] {
		return false
	}
	w.joined[chatID] = true
	return true
}

func (w *Worker) joinedRooms() []string {
	w.mu.Lock()
	defer w.mu.Unlock()

	rooms := make([]string, 0, len(w.joined))
	for chatID := range w.joined {
		rooms = append(rooms, chatID)
	}
	return rooms
}

const (
	reconnectBaseDelay = time.Second
	reconnectMaxDelay  = 30 * time.Second
)

func (w *Worker) Run(ctx context.Context) error {
	me, err := w.client.Me(ctx)
	if err != nil {
		return fmt.Errorf("[%s] validate key: %w", w.info.Key, err)
	}
	w.info.ID = me.ID
	if !w.llm.Configured() {
		log.Printf("[%s] WARNING: no LLM API key configured - messages will fail until the agent's source key is set", w.info.Key)
	}
	log.Printf("[%s] online as %s (%s)", w.info.Key, me.Handle, me.ID)

	// NOTE: we intentionally do NOT drain existing chats on startup. Old/leftover
	// chats can contain messages stuck unprocessed (e.g. a handoff target that
	// isn't a participant), and re-draining them every restart re-runs dead
	// pipelines and starves new runs. New runs are delivered via agent_rooms
	// (room_added -> join + drain) and live WebSocket message_created events.
	attempt := 0
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		connCtx, cancel := context.WithCancel(ctx)
		px := NewPhoenixClient(w.bandBaseURL, w.client.APIKey())
		if err := px.Connect(connCtx); err != nil {
			cancel()
			if waitErr := w.waitReconnect(ctx, attempt, err); waitErr != nil {
				return waitErr
			}
			attempt++
			continue
		}

		if err := px.Join("agent_rooms:" + w.info.ID); err != nil {
			cancel()
			if waitErr := w.waitReconnect(ctx, attempt, fmt.Errorf("join agent_rooms: %w", err)); waitErr != nil {
				return waitErr
			}
			attempt++
			continue
		}

		attempt = 0
		for _, chatID := range w.joinedRooms() {
			if err := px.Join("chat_room:" + chatID); err != nil {
				log.Printf("[%s] rejoin chat_room %s failed: %v", w.info.Key, chatID, err)
				continue
			}
			go w.drain(connCtx, chatID)
		}

		var dispatchWG sync.WaitGroup
		dispatchWG.Add(1)
		go func() {
			defer dispatchWG.Done()
			w.dispatch(connCtx, px)
		}()

		err := px.Run(connCtx)
		cancel()
		dispatchWG.Wait()

		if ctx.Err() != nil {
			return ctx.Err()
		}
		if waitErr := w.waitReconnect(ctx, attempt, err); waitErr != nil {
			return waitErr
		}
		attempt++
	}
}

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
				if id := extractRoomID(ev.Payload); id != "" && w.markJoined(id) {
					if err := px.Join("chat_room:" + id); err != nil {
						log.Printf("[%s] join chat_room %s failed: %v", w.info.Key, id, err)
					} else {
						go w.drain(ctx, id)
					}
				}
			}
		}
	}
}

func (w *Worker) waitReconnect(ctx context.Context, attempt int, err error) error {
	delay := reconnectDelay(attempt)
	hinted := retryAfterHint(err)
	if hinted > delay {
		delay = hinted
	}
	if hinted > 0 && !errors.Is(err, context.Canceled) {
		log.Printf("[%s] server requested reconnect wait of %s", w.info.Key, hinted)
	}
	log.Printf("[%s] websocket connection lost: %v; reconnecting in %s", w.info.Key, err, delay)

	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func reconnectDelay(attempt int) time.Duration {
	if attempt < 0 {
		attempt = 0
	}

	delay := reconnectBaseDelay
	for i := 0; i < attempt && delay < reconnectMaxDelay; i++ {
		delay *= 2
		if delay > reconnectMaxDelay {
			delay = reconnectMaxDelay
		}
	}
	return delay
}

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
			return
		}
		if attempted[msg.ID] {
			return
		}
		attempted[msg.ID] = true
		w.handle(ctx, chatID, msg)
	}
}

func (w *Worker) handle(ctx context.Context, chatID string, msg *band.IncomingMessage) {
	if !w.claim(msg.ID) {
		return // already handled via the drain or a WebSocket event
	}
	if err := w.client.MarkProcessing(ctx, chatID, msg.ID); err != nil {
		log.Printf("[%s] mark processing failed: %v", w.info.Key, err)
		return
	}

	runCtx, _ := band.ParseCtx(msg.Content)

	// Report the message we received so the backend can surface the pipeline
	// in the frontend (Band has no transcript API to poll).
	w.publishMirror(ctx, runCtx.Run, msg)

	var execReport, artifact string

	// Reviewer: build the accumulated generated files before reviewing.
	if w.execEnabled && w.role.execCode && !w.role.execAfter {
		if res := w.runCodeChecks(ctx, runCtx.Run, runCtx.Tgt, w.role.execMode); res != nil {
			execReport = res.promptText()
			artifact = res.artifactBlock()
		}
	}

	// GitHub Connector: open a real PR with the accumulated files.
	if w.role.createsPR {
		if url, prErr := w.createPR(ctx, runCtx); prErr != nil {
			log.Printf("[%s] PR creation failed: %v", w.info.Key, prErr)
			execReport = "PULL REQUEST: failed - " + prErr.Error()
			artifact = band.MarshalArtifact(band.Artifact{Kind: "pull_request", Status: "failed", Body: prErr.Error()})
		} else {
			log.Printf("[%s] opened PR: %s", w.info.Key, url)
			execReport = "PULL REQUEST opened: " + url
			artifact = band.MarshalArtifact(band.Artifact{Kind: "pull_request", Status: "open", Body: url})
		}
	}

	prompt := w.buildPrompt(ctx, msg, runCtx, execReport)

	output, err := w.llm.Complete(ctx, w.role.system, prompt)
	if err != nil {
		log.Printf("[%s] llm failed: %v", w.info.Key, err)
		_ = w.client.MarkFailed(ctx, chatID, msg.ID, err.Error())
		return
	}

	// Persist this agent's generated files for downstream stages.
	if w.role.producesFiles {
		if files := extractFiles(output); len(files) > 0 {
			w.storeFiles(ctx, runCtx.Run, files)
		}
	}

	// Test Generator: run the tests it just produced (now in the file store).
	if w.execEnabled && w.role.execCode && w.role.execAfter {
		if res := w.runCodeChecks(ctx, runCtx.Run, runCtx.Tgt, w.role.execMode); res != nil {
			artifact = res.artifactBlock()
		}
	}

	if next, ok := w.roster[w.role.next]; ok && w.role.next != "" {
		content := output
		if artifact != "" {
			content += "\n\n" + artifact
		}
		content += fmt.Sprintf("\n\n@%s - please continue.\n\n%s", next.Handle, band.MarshalCtx(runCtx))
		mentions := []band.Mention{{ID: next.ID, Name: next.Name, Handle: next.Handle}}
		if _, err := w.client.SendMessage(ctx, chatID, content, mentions); err != nil {
			log.Printf("[%s] handoff to %s failed: %v", w.info.Key, next.Handle, err)
			_ = w.client.MarkFailed(ctx, chatID, msg.ID, err.Error())
			return
		}
		log.Printf("[%s] processed -> handed off to %s", w.info.Key, next.Key)
	} else {
		log.Printf("[%s] processed (terminal)", w.info.Key)
	}

	if err := w.client.MarkProcessed(ctx, chatID, msg.ID); err != nil {
		log.Printf("[%s] mark processed failed: %v", w.info.Key, err)
	}
}

func (w *Worker) buildPrompt(ctx context.Context, msg *band.IncomingMessage, runCtx band.RunCtx, execReport string) string {
	content := msg.Content
	for _, m := range msg.Metadata.Mentions {
		content = strings.ReplaceAll(content, "@[["+m.ID+"]]", "@"+m.Name)
	}
	content = band.StripCtx(content)

	var b strings.Builder
	if w.role.needsSource && w.source != nil {
		if digest := w.source.Digest(ctx, runCtx); digest != "" {
			b.WriteString("REPOSITORY SOURCE (read this real code before answering):\n\n")
			b.WriteString(digest)
			b.WriteString("\n\n---\n\n")
		}
	}
	if execReport != "" {
		b.WriteString(execReport)
		b.WriteString("\n\n---\n\n")
	}
	fmt.Fprintf(&b, "A message addressed to you in the migration band:\n\n%s\n\nProduce your contribution for this stage. Be concise and structured.", content)
	return b.String()
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
