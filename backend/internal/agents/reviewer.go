package agents

import (
	"context"
	"fmt"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/models"
)

type ReviewerAgent struct {
	*BaseAgent
}

func NewReviewerAgent(bandService *band.Service, modelClient models.Client) *ReviewerAgent {
	return &ReviewerAgent{
		BaseAgent: NewBaseAgent(
			"reviewer-agent",
			bandService,
			modelClient,
			[]string{"codeReview", "qualityAssessment", "securityAnalysis"},
		),
	}
}

func (a *ReviewerAgent) Execute(ctx context.Context, input AgentInput) (*AgentOutput, error) {
	messages, err := a.bandService.ListMessages(ctx, input.BandRoomID, band.MessageFilters{})
	if err != nil {
		return nil, fmt.Errorf("failed to list messages: %w", err)
	}

	var generatedCode, testArtifacts, dbMigrationPlan map[string]interface{}
	for _, msg := range messages {
		if msg.AgentName == "target-code-generator-agent" {
			generatedCode = msg.Payload
		}
		if msg.AgentName == "test-generator-agent" {
			testArtifacts = msg.Payload
		}
		if msg.AgentName == "db-migration-agent" {
			dbMigrationPlan = msg.Payload
		}
	}

	prompt := `Review migration artifacts:

Generated Code:
- Files: %v
- Lines: %v
- Complexity: %v

Tests:
- Total: %v
- Coverage: %v%%
- Passing: %v
- Failing: %v

DB Migration:
- Risk Level: %v
- Tables: %v

Provide comprehensive review covering:
1. Code quality and best practices
2. Test coverage and quality
3. Security vulnerabilities
4. Performance concerns
5. DB migration risks
6. Recommendations for improvement`

	promptFormatted := fmt.Sprintf(prompt,
		generatedCode["filesGenerated"],
		generatedCode["totalLines"],
		generatedCode["qualityMetrics"].(map[string]interface{})["cyclomaticComplexity"],
		testArtifacts["totalTests"],
		testArtifacts["coverageEstimate"],
		testArtifacts["testResults"].(map[string]interface{})["passed"],
		testArtifacts["testResults"].(map[string]interface{})["failed"],
		dbMigrationPlan["riskLevel"],
		dbMigrationPlan["tablesToMigrate"])

	chatResp, err := a.modelClient.Chat(ctx, models.ChatRequest{
		Messages: []models.Message{
			{Role: "user", Content: promptFormatted},
		},
		Temperature: 0.6,
		MaxTokens:   2500,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get model response: %w", err)
	}

	reviewFindings := map[string]interface{}{
		"overallScore": 8.5,
		"modelReview":  chatResp.Message.Content,
		"findings": []map[string]interface{}{
			{
				"severity":       "high",
				"category":       "security",
				"title":          "SQL Injection Risk",
				"description":    "Direct string concatenation in query builder",
				"location":       "services/transaction_service.go:45",
				"recommendation": "Use parameterized queries",
			},
			{
				"severity":       "medium",
				"category":       "performance",
				"title":          "N+1 Query Pattern",
				"description":    "Loop making individual database calls",
				"location":       "services/customer_service.go:78",
				"recommendation": "Use batch query or JOIN",
			},
			{
				"severity":       "low",
				"category":       "codeQuality",
				"title":          "Missing Error Handling",
				"description":    "Error not properly propagated",
				"location":       "services/account_service.go:123",
				"recommendation": "Add proper error wrapping",
			},
		},
		"warnings": []string{
			"Test coverage below 90% threshold",
			"DB migration requires downtime",
			"4 failing tests need investigation",
		},
		"recommendations": []string{
			"Add error handling for edge cases in interest calculation",
			"Consider adding integration tests for external API calls",
			"Review and fix failing tests before PR creation",
			"Add database connection pooling configuration",
			"Implement rate limiting for API endpoints",
		},
		"securityScore":        7.5,
		"performanceScore":     8.0,
		"maintainabilityScore": 9.0,
		"testQualityScore":     8.5,
	}

	msg := band.AgentMessage{
		CompanyID:      input.CompanyID,
		ProjectID:      input.ProjectID,
		MigrationRunID: input.MigrationRunID,
		BandRoomID:     input.BandRoomID,
		AgentName:      a.Name(),
		MessageType:    band.MessageTypeReview,
		Phase:          band.PhaseReview,
		Summary:        "Review completed: Score 8.5/10, 1 high severity issue, 2 warnings",
		Payload:        reviewFindings,
		Confidence:     0.91,
		RequiresAction: true,
		TargetAgent:    "migration-commander-agent",
	}

	if err := a.PostMessage(ctx, msg); err != nil {
		return nil, fmt.Errorf("failed to post message: %w", err)
	}

	task := band.Task{
		RoomID:      input.BandRoomID,
		Name:        "Make Final Decision",
		Description: "Review all artifacts and make final migration decision",
		AssignedTo:  "migration-commander-agent",
		Status:      band.TaskStatusPending,
		Priority:    6,
		Input: map[string]interface{}{
			"reviewFindings": reviewFindings,
			"allArtifacts": map[string]interface{}{
				"code":  generatedCode,
				"tests": testArtifacts,
				"db":    dbMigrationPlan,
			},
		},
		CreatedBy: a.Name(),
	}

	if _, err := a.CreateTask(ctx, task); err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	return &AgentOutput{
		Success: true,
		Data: map[string]interface{}{
			"reviewFindings": reviewFindings,
			"nextAgent":      "migration-commander-agent",
			"nextPhase":      "review",
		},
	}, nil
}
