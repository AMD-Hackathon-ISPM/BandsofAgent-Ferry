package models

import (
	"fmt"

	"github.com/ferry/backend/internal/config"
)

func NewClient(cfg *config.ModelConfig) (Client, error) {
	switch cfg.Provider {
	case "ibm":
		return NewIBMClient(cfg.Endpoint, cfg.APIKey, cfg.Model), nil
	case "featherless":
		return NewFeatherlessClient(cfg.APIKey, cfg.Model), nil
	case "aiml":
		return NewAIMLClient(cfg.APIKey, cfg.Model), nil
	default:
		return nil, fmt.Errorf("unsupported model provider: %s", cfg.Provider)
	}
}
