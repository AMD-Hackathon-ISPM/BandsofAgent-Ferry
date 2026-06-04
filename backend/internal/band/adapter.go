package band

import (
	"context"
)

type Adapter interface {
	CreateRoom(ctx context.Context, req CreateRoomRequest) (*Room, error)
	GetRoom(ctx context.Context, roomID string) (*Room, error)
	ListRooms(ctx context.Context, filters RoomFilters) ([]Room, error)

	RegisterAgent(ctx context.Context, roomID, agentName string, capabilities []string) error
	UnregisterAgent(ctx context.Context, roomID, agentName string) error
	ListAgents(ctx context.Context, roomID string) ([]string, error)

	PostMessage(ctx context.Context, msg AgentMessage) (*MessageResponse, error)
	ListMessages(ctx context.Context, roomID string, filters MessageFilters) ([]AgentMessage, error)
	GetMessage(ctx context.Context, roomID, messageID string) (*AgentMessage, error)

	CreateTask(ctx context.Context, task Task) (*TaskResponse, error)
	UpdateTask(ctx context.Context, taskID string, update TaskUpdate) error
	CompleteTask(ctx context.Context, taskID string, result TaskResult) error
	HandoffTask(ctx context.Context, taskID, fromAgent, toAgent string, context map[string]interface{}) error
	ListTasks(ctx context.Context, roomID string, filters TaskFilters) ([]Task, error)

	SnapshotContext(ctx context.Context, roomID string) (*ContextSnapshot, error)
	GetContext(ctx context.Context, roomID string, keys []string) (map[string]interface{}, error)
	UpdateContext(ctx context.Context, roomID string, updates map[string]interface{}) error

	RecordDecision(ctx context.Context, decision Decision) error
	GetDecisions(ctx context.Context, roomID string) ([]Decision, error)
}
