package band

import (
	"context"
	"fmt"

	"github.com/ferry/backend/internal/config"
)

type Service struct {
	adapter Adapter
	config  *config.BandConfig
}

func NewService(cfg *config.BandConfig) (*Service, error) {
	var adapter Adapter

	switch cfg.Provider {
	case "stub":
		adapter = NewStubAdapter()
	case "http":
		return nil, fmt.Errorf("HTTP adapter not yet implemented")
	default:
		adapter = NewStubAdapter()
	}

	return &Service{
		adapter: adapter,
		config:  cfg,
	}, nil
}

func (s *Service) CreateRoom(ctx context.Context, req CreateRoomRequest) (*Room, error) {
	return s.adapter.CreateRoom(ctx, req)
}

func (s *Service) GetRoom(ctx context.Context, roomID string) (*Room, error) {
	return s.adapter.GetRoom(ctx, roomID)
}

func (s *Service) ListRooms(ctx context.Context, filters RoomFilters) ([]Room, error) {
	return s.adapter.ListRooms(ctx, filters)
}

func (s *Service) RegisterAgent(ctx context.Context, roomID, agentName string, capabilities []string) error {
	return s.adapter.RegisterAgent(ctx, roomID, agentName, capabilities)
}

func (s *Service) UnregisterAgent(ctx context.Context, roomID, agentName string) error {
	return s.adapter.UnregisterAgent(ctx, roomID, agentName)
}

func (s *Service) ListAgents(ctx context.Context, roomID string) ([]string, error) {
	return s.adapter.ListAgents(ctx, roomID)
}

func (s *Service) PostMessage(ctx context.Context, msg AgentMessage) (*MessageResponse, error) {
	return s.adapter.PostMessage(ctx, msg)
}

func (s *Service) ListMessages(ctx context.Context, roomID string, filters MessageFilters) ([]AgentMessage, error) {
	return s.adapter.ListMessages(ctx, roomID, filters)
}

func (s *Service) GetMessage(ctx context.Context, roomID, messageID string) (*AgentMessage, error) {
	return s.adapter.GetMessage(ctx, roomID, messageID)
}

func (s *Service) CreateTask(ctx context.Context, task Task) (*TaskResponse, error) {
	return s.adapter.CreateTask(ctx, task)
}

func (s *Service) UpdateTask(ctx context.Context, taskID string, update TaskUpdate) error {
	return s.adapter.UpdateTask(ctx, taskID, update)
}

func (s *Service) CompleteTask(ctx context.Context, taskID string, result TaskResult) error {
	return s.adapter.CompleteTask(ctx, taskID, result)
}

func (s *Service) HandoffTask(ctx context.Context, taskID, fromAgent, toAgent string, context map[string]interface{}) error {
	return s.adapter.HandoffTask(ctx, taskID, fromAgent, toAgent, context)
}

func (s *Service) ListTasks(ctx context.Context, roomID string, filters TaskFilters) ([]Task, error) {
	return s.adapter.ListTasks(ctx, roomID, filters)
}

func (s *Service) SnapshotContext(ctx context.Context, roomID string) (*ContextSnapshot, error) {
	return s.adapter.SnapshotContext(ctx, roomID)
}

func (s *Service) GetContext(ctx context.Context, roomID string, keys []string) (map[string]interface{}, error) {
	return s.adapter.GetContext(ctx, roomID, keys)
}

func (s *Service) UpdateContext(ctx context.Context, roomID string, updates map[string]interface{}) error {
	return s.adapter.UpdateContext(ctx, roomID, updates)
}

func (s *Service) RecordDecision(ctx context.Context, decision Decision) error {
	return s.adapter.RecordDecision(ctx, decision)
}

func (s *Service) GetDecisions(ctx context.Context, roomID string) ([]Decision, error) {
	return s.adapter.GetDecisions(ctx, roomID)
}
