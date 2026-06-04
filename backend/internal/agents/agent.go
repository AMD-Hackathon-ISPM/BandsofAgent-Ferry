package agents

import (
	"context"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/models"
)

type AgentInput struct {
	CompanyID      string
	ProjectID      string
	MigrationRunID string
	BandRoomID     string
	Data           map[string]interface{}
}

type AgentOutput struct {
	Success bool
	Data    map[string]interface{}
	Error   string
}

type Agent interface {
	Name() string
	Execute(ctx context.Context, input AgentInput) (*AgentOutput, error)
	Capabilities() []string
}

type BaseAgent struct {
	name         string
	bandService  *band.Service
	modelClient  models.Client
	capabilities []string
}

func NewBaseAgent(name string, bandService *band.Service, modelClient models.Client, capabilities []string) *BaseAgent {
	return &BaseAgent{
		name:         name,
		bandService:  bandService,
		modelClient:  modelClient,
		capabilities: capabilities,
	}
}

func (a *BaseAgent) Name() string {
	return a.name
}

func (a *BaseAgent) Capabilities() []string {
	return a.capabilities
}

func (a *BaseAgent) PostMessage(ctx context.Context, msg band.AgentMessage) error {
	_, err := a.bandService.PostMessage(ctx, msg)
	return err
}

func (a *BaseAgent) CreateTask(ctx context.Context, task band.Task) (*band.TaskResponse, error) {
	return a.bandService.CreateTask(ctx, task)
}

func (a *BaseAgent) CompleteTask(ctx context.Context, taskID string, result band.TaskResult) error {
	return a.bandService.CompleteTask(ctx, taskID, result)
}

func (a *BaseAgent) HandoffTask(ctx context.Context, taskID, toAgent string, context map[string]interface{}) error {
	return a.bandService.HandoffTask(ctx, taskID, a.name, toAgent, context)
}
