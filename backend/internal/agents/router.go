package agents

import (
	"context"
	"fmt"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/models"
)

type RouterAgent struct {
	*BaseAgent
}

func NewRouterAgent(bandService *band.Service, modelClient models.Client) *RouterAgent {
	return &RouterAgent{
		BaseAgent: NewBaseAgent(
			"router-agent",
			bandService,
			modelClient,
			[]string{"planning", "taskDelegation", "workflowOrchestration"},
		),
	}
}

func (a *RouterAgent) Execute(ctx context.Context, input AgentInput) (*AgentOutput, error) {
	migrationPlan := map[string]interface{}{
		"sourceLanguage":    input.Data["sourceLanguage"],
		"targetLanguage":    input.Data["targetLanguage"],
		"enableDbMigration": input.Data["enableDbMigration"],
		"phases": []string{
			"analysis",
			"translation",
			"dbMigration",
			"testing",
			"review",
			"prGeneration",
		},
		"estimatedDuration": "5-10 minutes",
	}

	msg := band.AgentMessage{
		CompanyID:      input.CompanyID,
		ProjectID:      input.ProjectID,
		MigrationRunID: input.MigrationRunID,
		BandRoomID:     input.BandRoomID,
		AgentName:      a.Name(),
		MessageType:    band.MessageTypeTaskRequest,
		Phase:          band.PhasePlanning,
		Summary:        fmt.Sprintf("Migration plan created for %s to %s conversion", input.Data["sourceLanguage"], input.Data["targetLanguage"]),
		Payload:        migrationPlan,
		Confidence:     0.95,
		RequiresAction: true,
		TargetAgent:    "source-analyzer-agent",
	}

	if err := a.PostMessage(ctx, msg); err != nil {
		return nil, fmt.Errorf("failed to post message: %w", err)
	}

	task := band.Task{
		RoomID:      input.BandRoomID,
		Name:        "Analyze Source Code",
		Description: "Analyze source code structure and identify key components",
		AssignedTo:  "source-analyzer-agent",
		Status:      band.TaskStatusPending,
		Priority:    1,
		Input: map[string]interface{}{
			"sourceLanguage": input.Data["sourceLanguage"],
			"fileCount":      input.Data["fileCount"],
		},
		CreatedBy: a.Name(),
	}

	if _, err := a.CreateTask(ctx, task); err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	return &AgentOutput{
		Success: true,
		Data: map[string]interface{}{
			"plan":      migrationPlan,
			"nextAgent": "source-analyzer-agent",
			"nextPhase": "analysis",
		},
	}, nil
}
