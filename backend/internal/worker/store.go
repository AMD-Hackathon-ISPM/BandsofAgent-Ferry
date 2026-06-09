package worker

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/ferry/backend/internal/band"
)

const mirrorChannel = "ferry:mirror"

func filesKey(runID string) string { return "ferry:files:" + runID }

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
