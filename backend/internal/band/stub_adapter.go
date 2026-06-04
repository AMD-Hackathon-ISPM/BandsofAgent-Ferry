package band

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

type StubAdapter struct {
	rooms     map[string]*Room
	messages  map[string][]AgentMessage
	tasks     map[string][]Task
	agents    map[string][]string
	decisions map[string][]Decision
	contexts  map[string]map[string]interface{}
	mu        sync.RWMutex
}

func NewStubAdapter() *StubAdapter {
	return &StubAdapter{
		rooms:     make(map[string]*Room),
		messages:  make(map[string][]AgentMessage),
		tasks:     make(map[string][]Task),
		agents:    make(map[string][]string),
		decisions: make(map[string][]Decision),
		contexts:  make(map[string]map[string]interface{}),
	}
}

func (a *StubAdapter) CreateRoom(ctx context.Context, req CreateRoomRequest) (*Room, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	room := &Room{
		ID:          fmt.Sprintf("room-%s", uuid.New().String()[:8]),
		Name:        req.Name,
		Description: req.Description,
		Metadata:    req.Metadata,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	a.rooms[room.ID] = room
	a.messages[room.ID] = []AgentMessage{}
	a.tasks[room.ID] = []Task{}
	a.agents[room.ID] = []string{}
	a.decisions[room.ID] = []Decision{}
	a.contexts[room.ID] = make(map[string]interface{})

	return room, nil
}

func (a *StubAdapter) GetRoom(ctx context.Context, roomID string) (*Room, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	room, exists := a.rooms[roomID]
	if !exists {
		return nil, fmt.Errorf("room not found: %s", roomID)
	}

	return room, nil
}

func (a *StubAdapter) ListRooms(ctx context.Context, filters RoomFilters) ([]Room, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	var rooms []Room
	for _, room := range a.rooms {
		rooms = append(rooms, *room)
	}

	return rooms, nil
}

func (a *StubAdapter) RegisterAgent(ctx context.Context, roomID, agentName string, capabilities []string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, exists := a.rooms[roomID]; !exists {
		return fmt.Errorf("room not found: %s", roomID)
	}

	a.agents[roomID] = append(a.agents[roomID], agentName)
	return nil
}

func (a *StubAdapter) UnregisterAgent(ctx context.Context, roomID, agentName string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	agents := a.agents[roomID]
	for i, agent := range agents {
		if agent == agentName {
			a.agents[roomID] = append(agents[:i], agents[i+1:]...)
			break
		}
	}

	return nil
}

func (a *StubAdapter) ListAgents(ctx context.Context, roomID string) ([]string, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	return a.agents[roomID], nil
}

func (a *StubAdapter) PostMessage(ctx context.Context, msg AgentMessage) (*MessageResponse, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, exists := a.rooms[msg.BandRoomID]; !exists {
		return nil, fmt.Errorf("room not found: %s", msg.BandRoomID)
	}

	msg.ID = uuid.New().String()
	msg.CreatedAt = time.Now()

	a.messages[msg.BandRoomID] = append(a.messages[msg.BandRoomID], msg)

	return &MessageResponse{
		MessageID: msg.ID,
		CreatedAt: msg.CreatedAt,
	}, nil
}

func (a *StubAdapter) ListMessages(ctx context.Context, roomID string, filters MessageFilters) ([]AgentMessage, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	messages := a.messages[roomID]
	var filtered []AgentMessage

	for _, msg := range messages {
		if filters.AgentName != "" && msg.AgentName != filters.AgentName {
			continue
		}
		if filters.MessageType != "" && msg.MessageType != filters.MessageType {
			continue
		}
		if filters.Phase != "" && msg.Phase != filters.Phase {
			continue
		}
		filtered = append(filtered, msg)
	}

	return filtered, nil
}

func (a *StubAdapter) GetMessage(ctx context.Context, roomID, messageID string) (*AgentMessage, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	messages := a.messages[roomID]
	for _, msg := range messages {
		if msg.ID == messageID {
			return &msg, nil
		}
	}

	return nil, fmt.Errorf("message not found: %s", messageID)
}

func (a *StubAdapter) CreateTask(ctx context.Context, task Task) (*TaskResponse, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, exists := a.rooms[task.RoomID]; !exists {
		return nil, fmt.Errorf("room not found: %s", task.RoomID)
	}

	task.ID = uuid.New().String()
	task.CreatedAt = time.Now()
	task.UpdatedAt = time.Now()

	a.tasks[task.RoomID] = append(a.tasks[task.RoomID], task)

	return &TaskResponse{
		TaskID:    task.ID,
		CreatedAt: task.CreatedAt,
	}, nil
}

func (a *StubAdapter) UpdateTask(ctx context.Context, taskID string, update TaskUpdate) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	for roomID, tasks := range a.tasks {
		for i, task := range tasks {
			if task.ID == taskID {
				a.tasks[roomID][i].Status = update.Status
				if update.Output != nil {
					a.tasks[roomID][i].Output = update.Output
				}
				a.tasks[roomID][i].UpdatedAt = time.Now()
				return nil
			}
		}
	}

	return fmt.Errorf("task not found: %s", taskID)
}

func (a *StubAdapter) CompleteTask(ctx context.Context, taskID string, result TaskResult) error {
	return a.UpdateTask(ctx, taskID, TaskUpdate{
		Status: TaskStatusCompleted,
		Output: result.Output,
	})
}

func (a *StubAdapter) HandoffTask(ctx context.Context, taskID, fromAgent, toAgent string, context map[string]interface{}) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	for roomID, tasks := range a.tasks {
		for i, task := range tasks {
			if task.ID == taskID {
				a.tasks[roomID][i].AssignedTo = toAgent
				a.tasks[roomID][i].UpdatedAt = time.Now()
				return nil
			}
		}
	}

	return fmt.Errorf("task not found: %s", taskID)
}

func (a *StubAdapter) ListTasks(ctx context.Context, roomID string, filters TaskFilters) ([]Task, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	tasks := a.tasks[roomID]
	var filtered []Task

	for _, task := range tasks {
		if filters.AssignedTo != "" && task.AssignedTo != filters.AssignedTo {
			continue
		}
		if filters.Status != "" && task.Status != filters.Status {
			continue
		}
		filtered = append(filtered, task)
	}

	return filtered, nil
}

func (a *StubAdapter) SnapshotContext(ctx context.Context, roomID string) (*ContextSnapshot, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if _, exists := a.rooms[roomID]; !exists {
		return nil, fmt.Errorf("room not found: %s", roomID)
	}

	snapshot := &ContextSnapshot{
		RoomID:     roomID,
		Data:       a.contexts[roomID],
		SnapshotAt: time.Now(),
	}

	return snapshot, nil
}

func (a *StubAdapter) GetContext(ctx context.Context, roomID string, keys []string) (map[string]interface{}, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if _, exists := a.rooms[roomID]; !exists {
		return nil, fmt.Errorf("room not found: %s", roomID)
	}

	result := make(map[string]interface{})
	for _, key := range keys {
		if value, exists := a.contexts[roomID][key]; exists {
			result[key] = value
		}
	}

	return result, nil
}

func (a *StubAdapter) UpdateContext(ctx context.Context, roomID string, updates map[string]interface{}) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, exists := a.rooms[roomID]; !exists {
		return fmt.Errorf("room not found: %s", roomID)
	}

	for key, value := range updates {
		a.contexts[roomID][key] = value
	}

	return nil
}

func (a *StubAdapter) RecordDecision(ctx context.Context, decision Decision) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, exists := a.rooms[decision.RoomID]; !exists {
		return fmt.Errorf("room not found: %s", decision.RoomID)
	}

	decision.ID = uuid.New().String()
	decision.CreatedAt = time.Now()

	a.decisions[decision.RoomID] = append(a.decisions[decision.RoomID], decision)

	return nil
}

func (a *StubAdapter) GetDecisions(ctx context.Context, roomID string) ([]Decision, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	return a.decisions[roomID], nil
}
