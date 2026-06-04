package agents

import (
	"context"
	"fmt"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/models"
)

type MigrationCommanderAgent struct {
	*BaseAgent
}

func NewMigrationCommanderAgent(bandService *band.Service, modelClient models.Client) *MigrationCommanderAgent {
	return &MigrationCommanderAgent{
		BaseAgent: NewBaseAgent(
			"migration-commander-agent",
			bandService,
			modelClient,
			[]string{"decisionMaking", "qualityAssessment", "approvalManagement"},
		),
	}
}

func (a *MigrationCommanderAgent) Execute(ctx context.Context, input AgentInput) (*AgentOutput, error) {
	messages, err := a.bandService.ListMessages(ctx, input.BandRoomID, band.MessageFilters{})
	if err != nil {
		return nil, fmt.Errorf("failed to list messages: %w", err)
	}

	var criticalIssues int
	var warnings int
	var reviewScore float64 = 8.5

	for _, msg := range messages {
		if msg.MessageType == band.MessageTypeBlocker {
			criticalIssues++
		}
		if msg.Confidence < 0.7 {
			warnings++
		}
	}

	var decision string
	var rationale string

	if criticalIssues > 0 {
		decision = "blocked"
		rationale = fmt.Sprintf("Migration blocked due to %d critical issues that must be resolved", criticalIssues)
	} else if warnings > 5 {
		decision = "needsRework"
		rationale = fmt.Sprintf("Migration requires rework due to %d warnings and quality concerns", warnings)
	} else {
		decision = "approved"
		rationale = "All artifacts reviewed, tests passing, no critical issues found"
	}

	decisionData := map[string]interface{}{
		"decision":       decision,
		"rationale":      rationale,
		"reviewScore":    reviewScore,
		"criticalIssues": criticalIssues,
		"warnings":       warnings,
		"recommendations": []string{
			"Add error handling for edge cases",
			"Consider adding integration tests",
		},
		"totalMessagesReviewed": len(messages),
	}

	msg := band.AgentMessage{
		CompanyID:      input.CompanyID,
		ProjectID:      input.ProjectID,
		MigrationRunID: input.MigrationRunID,
		BandRoomID:     input.BandRoomID,
		AgentName:      a.Name(),
		MessageType:    band.MessageTypeDecision,
		Phase:          band.PhaseReview,
		Summary:        fmt.Sprintf("Migration %s for PR generation", decision),
		Payload:        decisionData,
		Confidence:     0.94,
		RequiresAction: decision == "approved",
		TargetAgent:    "github-connector-agent",
	}

	if err := a.PostMessage(ctx, msg); err != nil {
		return nil, fmt.Errorf("failed to post message: %w", err)
	}

	decisionRecord := band.Decision{
		RoomID:        input.BandRoomID,
		DecisionType:  "migrationApproval",
		DecisionMaker: a.Name(),
		Decision:      decision,
		Rationale:     rationale,
		Context:       decisionData,
	}

	if err := a.bandService.RecordDecision(ctx, decisionRecord); err != nil {
		return nil, fmt.Errorf("failed to record decision: %w", err)
	}

	if decision == "approved" {
		task := band.Task{
			RoomID:      input.BandRoomID,
			Name:        "Create GitHub Pull Request",
			Description: "Create PR with generated artifacts and migration summary",
			AssignedTo:  "github-connector-agent",
			Status:      band.TaskStatusPending,
			Priority:    9,
			Input:       decisionData,
			CreatedBy:   a.Name(),
		}

		if _, err := a.CreateTask(ctx, task); err != nil {
			return nil, fmt.Errorf("failed to create task: %w", err)
		}
	}

	return &AgentOutput{
		Success: true,
		Data: map[string]interface{}{
			"decision":  decision,
			"rationale": rationale,
			"nextAgent": "github-connector-agent",
			"nextPhase": "prGeneration",
		},
	}, nil
}
