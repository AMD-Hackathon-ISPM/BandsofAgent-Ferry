package band

import (
	"context"
	"fmt"
	"strings"

	"github.com/ferry/backend/internal/config"
)

type Service struct {
	adapter Adapter
	client  *AgentClient
	config  *config.BandConfig
}

func NewService(cfg *config.BandConfig) (*Service, error) {
	s := &Service{
		adapter: NewStubAdapter(),
		config:  cfg,
	}

	switch cfg.Provider {
	case "band", "http":
		if cfg.BaseURL == "" {
			return nil, fmt.Errorf("BAND_BASE_URL is required when BAND_PROVIDER=%s", cfg.Provider)
		}
		routerKey := cfg.Agent("router").APIKey
		if routerKey == "" {
			return nil, fmt.Errorf("BAND_ROUTER_KEY (Router agent band_a_ key) is required when BAND_PROVIDER=%s", cfg.Provider)
		}

		s.client = NewAgentClient(cfg.BaseURL+"/agent", routerKey)
	case "stub":

	default:

	}

	return s, nil
}

func (s *Service) Namespace() string {
	return s.config.AgentNamespace
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

func (s *Service) StartFerryBandRoom(ctx context.Context, rc FerryRunContext) (string, error) {
	namespace := s.config.AgentNamespace
	roster := s.roster()

	if s.client == nil {
		room, err := s.adapter.CreateRoom(ctx, CreateRoomRequest{
			CompanyID:      rc.CompanyID,
			ProjectID:      rc.ProjectID,
			MigrationRunID: rc.MigrationRunID,
			Name:           rc.RoomName(),
		})
		if err != nil {
			return "", fmt.Errorf("create stub room: %w", err)
		}
		for _, a := range roster {
			_ = s.adapter.RegisterAgent(ctx, room.ID, a.Handle, a.Capabilities)
		}
		return room.ID, nil
	}

	chatID, err := s.client.CreateChat(ctx, "")
	if err != nil {
		return "", fmt.Errorf("create band chat: %w", err)
	}

	mentions := make([]Mention, 0, len(roster))
	for _, a := range roster {
		if a.Key == "router" {
			continue
		}
		if a.ID == "" {
			return "", fmt.Errorf("missing Band agent id for %q (set BAND_%s_ID)", a.Key, strings.ToUpper(a.Key))
		}
		if err := s.client.AddParticipant(ctx, chatID, a.ID); err != nil {
			return "", fmt.Errorf("add participant %s: %w", a.Handle, err)
		}
		mentions = append(mentions, Mention{ID: a.ID, Name: a.Name, Handle: a.Handle})
	}

	if _, err := s.client.SendMessage(ctx, chatID, BuildKickoffMessage(rc, namespace), mentions); err != nil {
		return "", fmt.Errorf("send kickoff: %w", err)
	}

	return chatID, nil
}

type rosterAgent struct {
	FerryAgent
	ID string
}

func (s *Service) roster() []rosterAgent {
	agents := FerryAgents(s.config.AgentNamespace)
	out := make([]rosterAgent, len(agents))
	for i, a := range agents {
		out[i] = rosterAgent{FerryAgent: a, ID: s.config.Agent(a.Key).ID}
	}
	return out
}
