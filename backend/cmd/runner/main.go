package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/ferry/backend/internal/sandbox"
)

func main() {
	port := os.Getenv("RUNNER_PORT")
	if port == "" {
		port = "9090"
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           sandbox.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	rt := os.Getenv("SANDBOX_RUNTIME")
	if rt == "" {
		rt = "runc (default)"
	}
	log.Printf("ferry runner listening on :%s (container runtime: %s)", port, rt)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("runner failed: %v", err)
	}
}
