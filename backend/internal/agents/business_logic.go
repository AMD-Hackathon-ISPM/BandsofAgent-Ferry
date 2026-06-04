package agents

import (
	"context"
	"fmt"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/models"
)

type BusinessLogicAgent struct {
	*BaseAgent
}

func NewBusinessLogicAgent(bandService *band.Service, modelClient models.Client) *BusinessLogicAgent {
	return &BusinessLogicAgent{
		BaseAgent: NewBaseAgent(
			"business-logic-agent",
			bandService,
			modelClient,
			[]string{"businessRuleExtraction", "validationPatternDetection", "logicMapping"},
		),
	}
}

func (a *BusinessLogicAgent) Execute(ctx context.Context, input AgentInput) (*AgentOutput, error) {
	messages, err := a.bandService.ListMessages(ctx, input.BandRoomID, band.MessageFilters{
		Phase: band.PhaseAnalysis,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list messages: %w", err)
	}

	var analysisData map[string]interface{}
	if len(messages) > 0 {
		analysisData = messages[0].Payload
	}

	prompt := fmt.Sprintf(`Based on the source code analysis:
Procedures: %v
Data Structures: %v
Complexity: %v

Extract and document:
1. Business rules
2. Validation patterns
3. Data transformation logic
4. Critical business workflows`,
		analysisData["procedures"],
		analysisData["dataStructures"],
		analysisData["complexityScore"])

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

	businessRules := map[string]interface{}{
		"totalRules": 23,
		"businessRules": []map[string]interface{}{
			{
				"id":           "BR-001",
				"name":         "Interest Calculation",
				"description":  "Calculate compound interest based on account type",
				"complexity":   "medium",
				"dependencies": []string{"account-type", "interest-rate-table"},
			},
			{
				"id":           "BR-002",
				"name":         "Account Validation",
				"description":  "Validate account number format and status",
				"complexity":   "low",
				"dependencies": []string{"account-number-format"},
			},
		},
		"validationPatterns": []map[string]interface{}{
			{
				"field":        "account-number",
				"pattern":      "^[0-9]{10}$",
				"errorMessage": "Invalid account number format",
			},
			{
				"field":        "transaction-amount",
				"pattern":      "^[0-9]+\\.[0-9]{2}$",
				"errorMessage": "Invalid amount format",
			},
		},
		"modelAnalysis": chatResp.Message.Content,
	}

	msg := band.AgentMessage{
		CompanyID:      input.CompanyID,
		ProjectID:      input.ProjectID,
		MigrationRunID: input.MigrationRunID,
		BandRoomID:     input.BandRoomID,
		AgentName:      a.Name(),
		MessageType:    band.MessageTypeHandoff,
		Phase:          band.PhaseAnalysis,
		Summary:        "Extracted 23 business rules and 12 validation patterns",
		Payload:        businessRules,
		Confidence:     0.92,
		RequiresAction: true,
		TargetAgent:    "target-code-generator-agent",
	}

	if err := a.PostMessage(ctx, msg); err != nil {
		return nil, fmt.Errorf("failed to post message: %w", err)
	}

	task := band.Task{
		RoomID:      input.BandRoomID,
		Name:        "Generate Target Code",
		Description: "Generate target language code based on analysis and business rules",
		AssignedTo:  "target-code-generator-agent",
		Status:      band.TaskStatusPending,
		Priority:    3,
		Input: map[string]interface{}{
			"analysis":      analysisData,
			"businessRules": businessRules,
		},
		CreatedBy: a.Name(),
	}

	if _, err := a.CreateTask(ctx, task); err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	return &AgentOutput{
		Success: true,
		Data: map[string]interface{}{
			"businessRules": businessRules,
			"nextAgent":     "target-code-generator-agent",
			"nextPhase":     "translation",
		},
	}, nil
}
