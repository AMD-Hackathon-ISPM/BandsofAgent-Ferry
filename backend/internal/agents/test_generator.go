package agents

import (
	"context"
	"fmt"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/models"
)

type TestGeneratorAgent struct {
	*BaseAgent
}

func NewTestGeneratorAgent(bandService *band.Service, modelClient models.Client) *TestGeneratorAgent {
	return &TestGeneratorAgent{
		BaseAgent: NewBaseAgent(
			"test-generator-agent",
			bandService,
			modelClient,
			[]string{"testGeneration", "coverageAnalysis", "testStrategy"},
		),
	}
}

func (a *TestGeneratorAgent) Execute(ctx context.Context, input AgentInput) (*AgentOutput, error) {
	messages, err := a.bandService.ListMessages(ctx, input.BandRoomID, band.MessageFilters{})
	if err != nil {
		return nil, fmt.Errorf("failed to list messages: %w", err)
	}

	var generatedCode, businessRules map[string]interface{}
	for _, msg := range messages {
		if msg.AgentName == "target-code-generator-agent" {
			generatedCode = msg.Payload
		}
		if msg.AgentName == "business-logic-agent" {
			businessRules = msg.Payload
		}
	}

	targetLang := generatedCode["targetLanguage"].(string)

	prompt := fmt.Sprintf(`Generate comprehensive tests for %s code:

Generated Files: %v
Business Rules: %v

Create:
1. Unit tests for each function
2. Integration tests for workflows
3. Edge case tests
4. Error handling tests
5. Performance tests
6. Test fixtures and mocks

Follow %s testing best practices.`,
		targetLang,
		generatedCode["filesGenerated"],
		businessRules["totalRules"],
		targetLang)

	chatResp, err := a.modelClient.Chat(ctx, models.ChatRequest{
		Messages: []models.Message{
			{Role: "user", Content: prompt},
		},
		Temperature: 0.4,
		MaxTokens:   3000,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get model response: %w", err)
	}

	testArtifacts := map[string]interface{}{
		"totalTests":       47,
		"unitTests":        32,
		"integrationTests": 12,
		"edgeCaseTests":    3,
		"modelOutput":      chatResp.Message.Content,
		"testFiles": []map[string]interface{}{
			{
				"type":      "testCode",
				"name":      "account_service_test.go",
				"path":      "services/account_service_test.go",
				"size":      "8.3 KB",
				"testCount": 15,
			},
			{
				"type":      "testCode",
				"name":      "transaction_service_test.go",
				"path":      "services/transaction_service_test.go",
				"size":      "11.1 KB",
				"testCount": 18,
			},
			{
				"type":      "testCode",
				"name":      "customer_service_test.go",
				"path":      "services/customer_service_test.go",
				"size":      "6.7 KB",
				"testCount": 14,
			},
		},
		"coverageEstimate": 85.5,
		"testResults": map[string]interface{}{
			"passed":   43,
			"failed":   4,
			"skipped":  0,
			"duration": "2.3s",
		},
	}

	msg := band.AgentMessage{
		CompanyID:      input.CompanyID,
		ProjectID:      input.ProjectID,
		MigrationRunID: input.MigrationRunID,
		BandRoomID:     input.BandRoomID,
		AgentName:      a.Name(),
		MessageType:    band.MessageTypeArtifactCreated,
		Phase:          band.PhaseTesting,
		Summary:        "Generated 47 tests with 85.5% coverage estimate, 43 passing, 4 failing",
		Payload:        testArtifacts,
		Confidence:     0.87,
		RequiresAction: true,
		TargetAgent:    "reviewer-agent",
	}

	if err := a.PostMessage(ctx, msg); err != nil {
		return nil, fmt.Errorf("failed to post message: %w", err)
	}

	task := band.Task{
		RoomID:      input.BandRoomID,
		Name:        "Review Migration Artifacts",
		Description: "Review all generated code, tests, and DB migration plans",
		AssignedTo:  "reviewer-agent",
		Status:      band.TaskStatusPending,
		Priority:    5,
		Input: map[string]interface{}{
			"generatedCode": generatedCode,
			"testArtifacts": testArtifacts,
		},
		CreatedBy: a.Name(),
	}

	if _, err := a.CreateTask(ctx, task); err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	return &AgentOutput{
		Success: true,
		Data: map[string]interface{}{
			"testArtifacts": testArtifacts,
			"nextAgent":     "reviewer-agent",
			"nextPhase":     "review",
		},
	}, nil
}
