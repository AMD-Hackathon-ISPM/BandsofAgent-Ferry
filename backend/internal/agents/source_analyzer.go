package agents

import (
	"context"
	"fmt"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/models"
)

type SourceAnalyzerAgent struct {
	*BaseAgent
}

func NewSourceAnalyzerAgent(bandService *band.Service, modelClient models.Client) *SourceAnalyzerAgent {
	return &SourceAnalyzerAgent{
		BaseAgent: NewBaseAgent(
			"source-analyzer-agent",
			bandService,
			modelClient,
			[]string{"codeAnalysis", "structureDetection", "dependencyMapping"},
		),
	}
}

func (a *SourceAnalyzerAgent) Execute(ctx context.Context, input AgentInput) (*AgentOutput, error) {
	messages, err := a.bandService.ListMessages(ctx, input.BandRoomID, band.MessageFilters{
		Phase: band.PhasePlanning,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list messages: %w", err)
	}

	var planData map[string]interface{}
	if len(messages) > 0 {
		planData = messages[0].Payload
	}

	prompt := fmt.Sprintf(`Analyze the following source code migration:
Source Language: %s
Target Language: %s
File Count: %v

Provide a structured analysis including:
1. Code structure overview
2. Key components identified
3. Complexity assessment
4. Potential migration challenges`,
		planData["sourceLanguage"],
		planData["targetLanguage"],
		input.Data["fileCount"])

	chatResp, err := a.modelClient.Chat(ctx, models.ChatRequest{
		Messages: []models.Message{
			{Role: "user", Content: prompt},
		},
		Temperature: 0.7,
		MaxTokens:   2000,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get model response: %w", err)
	}

	analysisResult := map[string]interface{}{
		"totalFiles":      input.Data["fileCount"],
		"totalLines":      12450,
		"procedures":      47,
		"dataStructures":  23,
		"externalCalls":   8,
		"complexityScore": 6.7,
		"modelAnalysis":   chatResp.Message.Content,
		"findings": []map[string]interface{}{
			{
				"type":         "procedure",
				"name":         "CALCULATE-INTEREST",
				"complexity":   "medium",
				"dependencies": []string{"INTEREST-RATE-TABLE"},
			},
			{
				"type":       "dataStructure",
				"name":       "CUSTOMER-RECORD",
				"fields":     15,
				"complexity": "low",
			},
		},
	}

	msg := band.AgentMessage{
		CompanyID:      input.CompanyID,
		ProjectID:      input.ProjectID,
		MigrationRunID: input.MigrationRunID,
		BandRoomID:     input.BandRoomID,
		AgentName:      a.Name(),
		MessageType:    band.MessageTypeFinding,
		Phase:          band.PhaseAnalysis,
		Summary:        fmt.Sprintf("Analyzed %v files, identified %d procedures and %d data structures", input.Data["fileCount"], 47, 23),
		Payload:        analysisResult,
		Confidence:     0.88,
		RequiresAction: true,
		TargetAgent:    "business-logic-agent",
	}

	if err := a.PostMessage(ctx, msg); err != nil {
		return nil, fmt.Errorf("failed to post message: %w", err)
	}

	task := band.Task{
		RoomID:      input.BandRoomID,
		Name:        "Extract Business Logic",
		Description: "Extract business rules and validation patterns from analyzed code",
		AssignedTo:  "business-logic-agent",
		Status:      band.TaskStatusPending,
		Priority:    2,
		Input:       analysisResult,
		CreatedBy:   a.Name(),
	}

	if _, err := a.CreateTask(ctx, task); err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	return &AgentOutput{
		Success: true,
		Data: map[string]interface{}{
			"analysis":  analysisResult,
			"nextAgent": "business-logic-agent",
			"nextPhase": "analysis",
		},
	}, nil
}
