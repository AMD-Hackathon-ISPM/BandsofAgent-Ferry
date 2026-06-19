package band

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

type DBPlan struct {
	RiskLevel        string   `json:"riskLevel"`
	RequiresDowntime bool     `json:"requiresDowntime"`
	EstimatedSeconds int      `json:"estimatedSeconds"`
	RiskFactors      []string `json:"riskFactors"`
	MigrationSQL     string   `json:"migrationSql"`
	RollbackSQL      string   `json:"rollbackSql"`
	SourceSchema     string   `json:"sourceSchema"`
	TargetSchema     string   `json:"targetSchema"`
	ValidationSQL    string   `json:"validationSql"`
}

var dbPlanRe = regexp.MustCompile(`(?s)\[ferry-dbplan\]\s*(.*?)\s*\[/ferry-dbplan\]`)
var dbPlanBlankLinesRe = regexp.MustCompile(`\n{3,}`)

func MarshalDBPlan(plan DBPlan) string {
	raw, _ := json.Marshal(plan)
	return fmt.Sprintf("[ferry-dbplan]%s[/ferry-dbplan]", raw)
}

func ParseDBPlan(content string) (DBPlan, string, bool) {
	match := dbPlanRe.FindStringSubmatch(content)
	if match == nil {
		return DBPlan{}, content, false
	}

	var plan DBPlan
	if err := json.Unmarshal([]byte(match[1]), &plan); err != nil {
		return DBPlan{}, content, false
	}

	cleaned := strings.TrimSpace(dbPlanBlankLinesRe.ReplaceAllString(dbPlanRe.ReplaceAllString(content, ""), "\n\n"))
	return plan, cleaned, true
}
