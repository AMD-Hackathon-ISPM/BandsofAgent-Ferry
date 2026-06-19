package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/ferry/backend/internal/band"
)

const mirrorChannel = "ferry:mirror"
const runActiveKeyPrefix = "ferry:run:active:"
const runTerminalKeyPrefix = "ferry:run:terminal:"

// claimTTL bounds how long a step/doc lives in Redis — long enough to outlast a
// whole run (incl. reworks) but self-healing afterward.
const claimTTL = 6 * time.Hour

func filesKey(runID string) string       { return "ferry:files:" + runID }
func snapshotKey(runID string) string    { return "ferry:files:" + runID + ":prev" }
func docsKey(runID string) string        { return "ferry:pipeline:" + runID }
func activeRunKey(runID string) string   { return runActiveKeyPrefix + runID }
func terminalRunKey(runID string) string { return runTerminalKeyPrefix + runID }

func stepKey(runID, agentKey string, rework int) string {
	return fmt.Sprintf("ferry:step:%s:%s:%d", runID, agentKey, rework)
}

// claimStep marks a logical pipeline step (run+agent+rework) as taken so a
// duplicate or redelivered message for the same step can't drive a second
// handoff — this is what stops one agent from running many times when the
// process restarts or Band redelivers. Returns true if THIS call won the claim
// (proceed); false if the step was already claimed (skip). On a Redis error it
// fails OPEN (proceed): a rare duplicate is better than a stalled run. Falls
// back to an in-memory guard when Redis isn't configured.
func (w *Worker) claimStep(ctx context.Context, runID, agentKey string, rework int) bool {
	if runID == "" {
		return true
	}
	key := stepKey(runID, agentKey, rework)
	if w.rdb == nil {
		w.mu.Lock()
		defer w.mu.Unlock()
		if w.steps[key] {
			return false
		}
		w.steps[key] = true
		return true
	}
	ok, err := w.rdb.SetNX(ctx, key, "1", claimTTL).Result()
	if err != nil {
		log.Printf("[%s] step claim error (proceeding) for %s: %v", w.info.Key, key, err)
		return true
	}
	return ok
}

// releaseStep undoes a claim so a FAILED step can be retried when Band
// redelivers its message (success keeps the claim until TTL).
func (w *Worker) releaseStep(ctx context.Context, runID, agentKey string, rework int) {
	if runID == "" {
		return
	}
	key := stepKey(runID, agentKey, rework)
	if w.rdb == nil {
		w.mu.Lock()
		delete(w.steps, key)
		w.mu.Unlock()
		return
	}
	if err := w.rdb.Del(ctx, key).Err(); err != nil {
		log.Printf("[%s] step release error for %s: %v", w.info.Key, key, err)
	}
}

// storeDoc persists a handoff document (e.g. spec.md, changes.md) in the run's
// shared pipeline store so the next agent reads it directly instead of having
// the full text re-pasted into every chat message.
func (w *Worker) storeDoc(ctx context.Context, runID, name, body string) {
	if w.rdb == nil || runID == "" || name == "" || strings.TrimSpace(body) == "" {
		return
	}
	key := docsKey(runID)
	w.rdb.HSet(ctx, key, name, body)
	w.rdb.Expire(ctx, key, claimTTL)
}

// loadDocs returns the requested handoff docs (missing/empty ones are omitted).
func (w *Worker) loadDocs(ctx context.Context, runID string, names ...string) map[string]string {
	if w.rdb == nil || runID == "" || len(names) == 0 {
		return nil
	}
	vals, err := w.rdb.HMGet(ctx, docsKey(runID), names...).Result()
	if err != nil {
		return nil
	}
	out := make(map[string]string, len(names))
	for i, v := range vals {
		if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
			out[names[i]] = s
		}
	}
	return out
}

// snapshotFiles copies the current file set to a side key so the reviewer can
// diff what a rework changed. Call it right before a rework code-gen overwrites
// files, to capture the prior cycle's state.
func (w *Worker) snapshotFiles(ctx context.Context, runID string) {
	if w.rdb == nil || runID == "" {
		return
	}
	cur := w.loadFiles(ctx, runID)
	if len(cur) == 0 {
		return
	}
	kv := make(map[string]interface{}, len(cur))
	for k, v := range cur {
		kv[k] = v
	}
	key := snapshotKey(runID)
	w.rdb.Del(ctx, key)
	w.rdb.HSet(ctx, key, kv)
	w.rdb.Expire(ctx, key, claimTTL)
}

// loadSnapshot returns the file set captured by the last snapshotFiles call.
func (w *Worker) loadSnapshot(ctx context.Context, runID string) map[string]string {
	if w.rdb == nil || runID == "" {
		return nil
	}
	res, err := w.rdb.HGetAll(ctx, snapshotKey(runID)).Result()
	if err != nil {
		return nil
	}
	return res
}

// mirrorMsg is what a worker publishes for the backend to persist + stream.
type mirrorMsg struct {
	RunID     string `json:"runId"`
	Agent     string `json:"agent"`
	ID        string `json:"id"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

// publishMirror emits an observed message so the backend can surface it in the
// frontend. Band has no transcript API, so each worker reports the message it
// received (attributed to its sender); collectively this is the full pipeline.
func (w *Worker) publishMirror(ctx context.Context, runID string, msg *band.IncomingMessage) {
	if w.rdb == nil || runID == "" {
		return
	}
	sender := w.keyByID[msg.SenderID]
	if sender == "" {
		return
	}
	content := msg.Content
	for _, m := range msg.Metadata.Mentions {
		content = strings.ReplaceAll(content, "@[["+m.ID+"]]", "@"+m.Name)
	}
	content = band.StripCtx(content)

	data, _ := json.Marshal(mirrorMsg{
		RunID:     runID,
		Agent:     sender,
		ID:        msg.ID,
		Content:   content,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	w.rdb.Publish(ctx, mirrorChannel, data)
}

// storeFiles merges generated files into the run's Redis file store so later
// agents (reviewer, github_connector) can read the full set — the Agent API
// only exposes an agent's own inbox, not the transcript.
func (w *Worker) storeFiles(ctx context.Context, runID string, files map[string]string) {
	if w.rdb == nil || runID == "" || len(files) == 0 {
		return
	}
	kv := make(map[string]interface{}, len(files))
	for k, v := range files {
		kv[k] = v
	}
	key := filesKey(runID)
	w.rdb.HSet(ctx, key, kv)
	w.rdb.Expire(ctx, key, 6*time.Hour)
}

// loadFiles returns all generated files accumulated for the run.
func (w *Worker) loadFiles(ctx context.Context, runID string) map[string]string {
	if w.rdb == nil || runID == "" {
		return nil
	}
	res, err := w.rdb.HGetAll(ctx, filesKey(runID)).Result()
	if err != nil {
		return nil
	}
	return res
}
