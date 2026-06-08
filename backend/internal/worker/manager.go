package worker

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/config"
)

// Manager owns all agent workers for one process.
type Manager struct {
	workers []*Worker
}

// NewManager builds a Worker for every agent that has a Band key configured.
// Each worker is bound to its own Band Agent API key and its own LLM
// (model + source) from the per-agent configuration.
func NewManager(cfg *config.Config) (*Manager, error) {
	baseURL := cfg.Band.BaseURL + "/agent"

	// Build the shared roster (key → id/handle/name) for handoff @mentions.
	roster := make(map[string]AgentInfo)
	for _, a := range band.FerryAgents(cfg.Band.AgentNamespace) {
		roster[a.Key] = AgentInfo{
			Key:    a.Key,
			ID:     cfg.Band.Agent(a.Key).ID,
			Handle: a.Handle,
			Name:   a.Name,
		}
	}

	// Shared limiter so all agents together stay within the provider's
	// concurrency cap (e.g. Featherless reasoning models allow 2 at a time).
	limiter := NewLimiter(cfg.Agents.MaxConcurrency)
	log.Printf("LLM concurrency limit: %d", cfg.Agents.MaxConcurrency)

	var workers []*Worker
	for _, a := range band.FerryAgents(cfg.Band.AgentNamespace) {
		ident := cfg.Band.Agent(a.Key)
		if ident.APIKey == "" {
			log.Printf("[%s] skipped: no BAND_%s_KEY configured", a.Key, upper(a.Key))
			continue
		}
		role, ok := agentRoles[a.Key]
		if !ok {
			continue
		}

		llmBase, llmKey, llmModel := cfg.Agents.ForAgent(a.Key)
		client := band.NewAgentClient(baseURL, ident.APIKey)
		llm := NewLLM(llmBase, llmKey, llmModel, limiter)

		workers = append(workers, NewWorker(roster[a.Key], role, client, llm, roster))
	}

	if len(workers) == 0 {
		return nil, fmt.Errorf("no agent workers configured (set BAND_<AGENT>_KEY values)")
	}
	return &Manager{workers: workers}, nil
}

// Run starts every worker and blocks until ctx is cancelled. A worker that
// errors is logged and restarted is left to the caller (process supervisor).
func (m *Manager) Run(ctx context.Context) {
	var wg sync.WaitGroup
	for _, w := range m.workers {
		wg.Add(1)
		go func(w *Worker) {
			defer wg.Done()
			if err := w.Run(ctx); err != nil && ctx.Err() == nil {
				log.Printf("[%s] worker stopped: %v", w.info.Key, err)
			}
		}(w)
	}
	wg.Wait()
}

func upper(s string) string {
	out := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'a' && c <= 'z' {
			c -= 32
		}
		out[i] = c
	}
	return string(out)
}
