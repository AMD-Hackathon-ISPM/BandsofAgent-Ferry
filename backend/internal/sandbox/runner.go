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
}

func Execute(ctx context.Context, runnerURL string, spec Spec) (Result, error) {
	if runnerURL == "" {
		return Run(ctx, spec)
	}
	return (&Client{URL: runnerURL, http: &http.Client{Timeout: 5 * time.Minute}}).Run(ctx, spec)
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
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(res)
	})
	return mux
}
