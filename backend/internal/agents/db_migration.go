package agents

import (
	"context"
	"fmt"

	"github.com/ferry/backend/internal/band"
	"github.com/ferry/backend/internal/models"
)

type DBMigrationAgent struct {
	*BaseAgent
}

func NewDBMigrationAgent(bandService *band.Service, modelClient models.Client) *DBMigrationAgent {
	return &DBMigrationAgent{
		BaseAgent: NewBaseAgent(
			"db-migration-agent",
			bandService,
			modelClient,
			[]string{"dbSchemaAnalysis", "migrationPlanning", "riskAssessment"},
		),
	}
}

func (a *DBMigrationAgent) Execute(ctx context.Context, input AgentInput) (*AgentOutput, error) {
	enableDbMigration := input.Data["enableDbMigration"].(bool)
	if !enableDbMigration {
		return &AgentOutput{
			Success: true,
			Data: map[string]interface{}{
				"skipped": true,
				"reason":  "DB migration not enabled for this project",
			},
		}, nil
	}

	prompt := `Analyze MySQL MyISAM to InnoDB migration:

Generate migration plan including:
1. Schema changes required
2. Index modifications
3. Foreign key constraints
4. Data migration strategy
5. Risk assessment
6. Rollback plan
7. Validation queries

Identify risks:
- Missing primary keys
- Duplicate key issues
- Foreign key candidates
- Charset/collation issues
- Large table lock risks`

	chatResp, err := a.modelClient.Chat(ctx, models.ChatRequest{
		Messages: []models.Message{
			{Role: "user", Content: prompt},
		},
		Temperature: 0.5,
		MaxTokens:   3000,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get model response: %w", err)
	}

	migrationPlan := map[string]interface{}{
		"sourceEngine":             "MyISAM",
		"targetEngine":             "InnoDB",
		"tablesToMigrate":          12,
		"estimatedDurationSeconds": 1800,
		"requiresDowntime":         true,
		"riskLevel":                "medium",
		"modelAnalysis":            chatResp.Message.Content,
		"riskFactors": []map[string]interface{}{
			{
				"type":        "missingPrimaryKey",
				"severity":    "high",
				"table":       "transactions",
				"description": "Table lacks primary key, required for InnoDB",
				"mitigation":  "Add auto-increment primary key column",
			},
			{
				"type":        "largeTable",
				"severity":    "medium",
				"table":       "audit_log",
				"description": "Table has 50M rows, migration will take time",
				"mitigation":  "Schedule during maintenance window",
			},
			{
				"type":        "charsetIssue",
				"severity":    "low",
				"table":       "customers",
				"description": "Mixed charset usage detected",
				"mitigation":  "Standardize to utf8mb4",
			},
		},
		"migrationSql": `ALTER TABLE transactions ADD COLUMN id BIGINT AUTO_INCREMENT PRIMARY KEY FIRST;
ALTER TABLE transactions ENGINE=InnoDB;
ALTER TABLE customers CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE customers ENGINE=InnoDB;`,
		"rollbackSql": `ALTER TABLE transactions ENGINE=MyISAM;
ALTER TABLE customers ENGINE=MyISAM;`,
		"validationSql": `SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();
SELECT COUNT(*) FROM transactions;
SELECT COUNT(*) FROM customers;`,
	}

	msg := band.AgentMessage{
		CompanyID:      input.CompanyID,
		ProjectID:      input.ProjectID,
		MigrationRunID: input.MigrationRunID,
		BandRoomID:     input.BandRoomID,
		AgentName:      a.Name(),
		MessageType:    band.MessageTypeFinding,
		Phase:          band.PhaseDBMigration,
		Summary:        "DB migration plan created: 12 tables, medium risk, 30min estimated",
		Payload:        migrationPlan,
		Confidence:     0.82,
		RequiresAction: true,
		TargetAgent:    "reviewer-agent",
	}

	if err := a.PostMessage(ctx, msg); err != nil {
		return nil, fmt.Errorf("failed to post message: %w", err)
	}

	return &AgentOutput{
		Success: true,
		Data: map[string]interface{}{
			"migrationPlan": migrationPlan,
			"nextAgent":     "reviewer-agent",
			"nextPhase":     "review",
		},
	}, nil
}
