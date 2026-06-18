package worker

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/config"
	"github.com/ferry/backend/internal/github"
	"github.com/redis/go-redis/v9"
)

type Manager struct {
	workers []*Worker
}

func NewManager(cfg *config.Config) (*Manager, error) {
	baseURL := cfg.Band.BaseURL + "/agent"

	roster := make(map[string]AgentInfo)
	for _, a := range band.FerryAgents(cfg.Band.AgentNamespace) {
		roster[a.Key] = AgentInfo{
			Key:    a.Key,
			ID:     cfg.Band.Agent(a.Key).ID,
			Handle: a.Handle,
			Name:   a.Name,
		}
	}

	// One limiter per concurrency slot (= per provider key), so concurrent runs
	// on different keys don't share a single budget.
	slots := cfg.Agents.Slots()
	limiters := make([]*Limiter, slots)
	for i := range limiters {
		limiters[i] = NewLimiter(cfg.Agents.MaxConcurrency)
	}
	llm := NewLLM()
	log.Printf("run concurrency slots: %d (LLM concurrency/slot: %d)", slots, cfg.Agents.MaxConcurrency)

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Redis.Host + ":" + cfg.Redis.Port,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})

	ghApp, err := github.NewApp(cfg.GitHub.AppID, cfg.GitHub.AppSlug, cfg.GitHub.AppPrivateKey)
	if err != nil {
		log.Printf("github app disabled: %v", err)
	} else if ghApp != nil {
		log.Printf("github app enabled (id %s) — PRs use per-repo installation tokens", cfg.GitHub.AppID)
	}
	ghTokens := github.NewUserTokens(rdb, cfg.GitHub.ClientID, cfg.GitHub.ClientSecret, cfg.GitHub.PAT)
	source := NewSourceProvider(ghTokens, ghApp)

	keyByID := make(map[string]string)
	for key, a := range cfg.Band.Agents {
		if a.ID != "" {
			keyByID[a.ID] = key
		}
	}

	execEnabled := cfg.Features.EnableCodeExecution
	if execEnabled {
		log.Printf("sandbox code execution: ENABLED (runner=%q)", cfg.Sandbox.RunnerURL)
	}

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

		client := band.NewAgentClient(baseURL, ident.APIKey)
		agentKey := a.Key
		resolveLLM := func(target string, slot int) (string, string, string) {
			return cfg.Agents.ForAgentTargetSlot(agentKey, target, slot)
		}

		workers = append(workers, NewWorker(roster[a.Key], role, client, llm, resolveLLM, limiters, source, execEnabled, cfg.Sandbox.RunnerURL, cfg.Band.BaseURL, roster, rdb, keyByID))
	}

	if len(workers) == 0 {
		return nil, fmt.Errorf("no agent workers configured (set BAND_<AGENT>_KEY values)")
	}
	return &Manager{workers: workers}, nil
}

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
