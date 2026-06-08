// Command agents runs the Ferry Band agent workers. Each of the 9 agents
// connects to Band over WebSocket with its own key, consumes its inbox, runs
// its configured LLM, and hands off to the next agent in the migration
// pipeline. This is a separate process from the API server (cmd/api).
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/ferry/backend/internal/config"
	"github.com/ferry/backend/internal/worker"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	mgr, err := worker.NewManager(cfg)
	if err != nil {
		log.Fatalf("failed to build agent workers: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Println("ferry agent workers starting")
	mgr.Run(ctx)
	log.Println("ferry agent workers stopped")
}
