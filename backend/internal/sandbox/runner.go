package sandbox

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type runRequest struct {
	Image      string            `json:"image"`
	Files      map[string]string `json:"files"`
	Script     string            `json:"script"`
	TimeoutSec int               `json:"timeoutSec"`
	RunID      string            `json:"runId"`
}

func Execute(ctx context.Context, runnerURL string, spec Spec) (Result, error) {
	if runnerURL == "" {
		return Run(ctx, spec)
	}
	return (&Client{URL: runnerURL, http: &http.Client{Timeout: 5 * time.Minute}}).Run(ctx, spec)
}

// Cleanup tears down a run's persistent workspace container (best-effort),
// going through the runner when one is configured.
func Cleanup(ctx context.Context, runnerURL, runID string) {
	if runID == "" {
		return
	}
	if runnerURL == "" {
		RemoveWorkspace(ctx, runID)
		return
	}
	(&Client{URL: runnerURL, http: &http.Client{Timeout: 30 * time.Second}}).Cleanup(ctx, runID)
}

type Client struct {
	URL  string
	http *http.Client
}

func (c *Client) Run(ctx context.Context, spec Spec) (Result, error) {
	body, _ := json.Marshal(runRequest{
		Image:      spec.Image,
		Files:      spec.Files,
		Script:     spec.Script,
		TimeoutSec: int(spec.Timeout / time.Second),
		RunID:      spec.RunID,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL+"/run", bytes.NewReader(body))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("runner request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return Result{}, fmt.Errorf("runner status %d: %s", resp.StatusCode, snippet)
	}
	var res Result
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return Result{}, fmt.Errorf("decode runner response: %w", err)
	}
	return res, nil
}

func (c *Client) Cleanup(ctx context.Context, runID string) {
	body, _ := json.Marshal(runRequest{RunID: runID})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL+"/cleanup", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if resp, err := c.http.Do(req); err == nil {
		resp.Body.Close()
	}
}

func Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("POST /run", func(w http.ResponseWriter, r *http.Request) {
		var req runRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		res, err := Run(r.Context(), Spec{
			Image:   req.Image,
			Files:   req.Files,
			Script:  req.Script,
			Timeout: time.Duration(req.TimeoutSec) * time.Second,
			RunID:   req.RunID,
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(res)
	})
	mux.HandleFunc("POST /cleanup", func(w http.ResponseWriter, r *http.Request) {
		var req runRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		RemoveWorkspace(r.Context(), req.RunID)
		w.WriteHeader(http.StatusNoContent)
	})
	return mux
}
