package band

import (
	"fmt"
)

type FerryAgent struct {
	Key          string
	Handle       string
	Name         string
	Capabilities []string
}

func (a FerryAgent) Mention() string { return "@" + a.Handle }

type ferryAgentSpec struct {
	key          string
	handleSuffix string
	name         string
	capabilities []string
}

var ferryAgentSpecs = []ferryAgentSpec{
	{"router", "ferryrouter", "FerryRouter", []string{"planning", "taskDelegation", "workflowOrchestration"}},
	{"source_analyzer", "ferrysourceanalyzer", "FerrySourceAnalyzer", []string{"repoAnalysis", "frameworkDetection", "architecture"}},
	{"business_logic", "ferrybusinesslogic", "FerryBusinessLogic", []string{"businessRules", "domainLogic", "workflows"}},
	{"code_generator", "ferrycodegenerator", "FerryCodeGenerator", []string{"codeGeneration", "translation"}},
	{"db_migration", "ferrydbmigrator", "FerryDBMigrator", []string{"schemaAnalysis", "myisamToInnodb", "migrationPlan"}},
	{"test_generator", "ferrytestgenerator", "FerryTestGenerator", []string{"unitTests", "integrationTests", "validation"}},
	{"reviewer", "ferryreviewer", "FerryReviewer", []string{"review", "issueDetection", "revisionRequests"}},
	{"commander", "ferrycommander", "FerryCommander", []string{"readinessEvaluation", "approval"}},
	{"github_connector", "ferrygithubconnector", "FerryGithubConnector", []string{"branching", "commit", "pullRequest"}},
}

func FerryAgents(namespace string) []FerryAgent {
	agents := make([]FerryAgent, len(ferryAgentSpecs))
	for i, spec := range ferryAgentSpecs {
		agents[i] = FerryAgent{
			Key:          spec.key,
			Handle:       fmt.Sprintf("%s/%s", namespace, spec.handleSuffix),
			Name:         spec.name,
			Capabilities: spec.capabilities,
		}
	}
	return agents
}

func RouterHandle(namespace string) string {
	return fmt.Sprintf("%s/ferryrouter", namespace)
}

type FerryRunContext struct {
	CompanyID          string
	ProjectID          string
	MigrationRunID     string
	RepoFullName       string
	Branch             string
	SourceLanguage     string
	TargetLanguage     string
	DBMigrationEnabled bool
	DBFileID           string
	User               string
	Slot               int // concurrency slot assigned by the scheduler (selects the API key)
	IsGuest            bool
}

func (rc FerryRunContext) RoomName() string {
	return fmt.Sprintf("Ferry: %s (%s → %s)", rc.RepoFullName, rc.SourceLanguage, rc.TargetLanguage)
}

func BuildKickoffMessage(rc FerryRunContext, namespace string) string {
	dbFile := rc.DBFileID
	if dbFile == "" {
		dbFile = "none"
	}

	sequence := "source analysis → business logic → code generation → DB migration → tests → review → command → GitHub PR"
	if !rc.DBMigrationEnabled {
		sequence = "source analysis → business logic → code generation → tests → review → command → GitHub PR (DB migration is disabled for this run — the DB Migrator is skipped)"
	}

	return fmt.Sprintf(`@%s/ferrysourceanalyzer

Start Ferry migration run.

Repository: %s

Source Language: %s

Target Language: %s

Database Migration Enabled: %t

Database File: %s

You are the first stage. Analyze the repository, then hand off to the next agent. The band proceeds in sequence: %s. Each agent hands off to the next; do not mention the others now.

%s`,
		namespace,
		rc.RepoFullName,
		rc.SourceLanguage,
		rc.TargetLanguage,
		rc.DBMigrationEnabled,
		dbFile,
		sequence,
		MarshalCtx(RunCtx{Repo: rc.RepoFullName, Branch: rc.Branch, Src: rc.SourceLanguage, Tgt: rc.TargetLanguage, User: rc.User, Run: rc.MigrationRunID, DBEnabled: rc.DBMigrationEnabled, Slot: rc.Slot, IsGuest: rc.IsGuest}),
	)
}
