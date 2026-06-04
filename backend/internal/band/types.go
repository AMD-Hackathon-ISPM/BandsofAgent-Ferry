package band

import (
	"time"
)

type MessageType string

const (
	MessageTypeFinding         MessageType = "finding"
	MessageTypeTaskRequest     MessageType = "taskRequest"
	MessageTypeHandoff         MessageType = "handoff"
	MessageTypeReview          MessageType = "review"
	MessageTypeDecision        MessageType = "decision"
	MessageTypeArtifactCreated MessageType = "artifactCreated"
	MessageTypeBlocker         MessageType = "blocker"
)

type MigrationPhase string

const (
	PhasePlanning     MigrationPhase = "planning"
	PhaseAnalysis     MigrationPhase = "analysis"
	PhaseTranslation  MigrationPhase = "translation"
	PhaseDBMigration  MigrationPhase = "dbMigration"
	PhaseTesting      MigrationPhase = "testing"
	PhaseReview       MigrationPhase = "review"
	PhasePRGeneration MigrationPhase = "prGeneration"
	PhaseCompleted    MigrationPhase = "completed"
)

type TaskStatus string

const (
	TaskStatusPending    TaskStatus = "pending"
	TaskStatusInProgress TaskStatus = "inProgress"
	TaskStatusCompleted  TaskStatus = "completed"
	TaskStatusFailed     TaskStatus = "failed"
	TaskStatusBlocked    TaskStatus = "blocked"
)

type CreateRoomRequest struct {
	CompanyID      string                 `json:"companyId"`
	ProjectID      string                 `json:"projectId"`
	MigrationRunID string                 `json:"migrationRunId"`
	Name           string                 `json:"name"`
	Description    string                 `json:"description"`
	Metadata       map[string]interface{} `json:"metadata"`
}

type Room struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Metadata    map[string]interface{} `json:"metadata"`
	CreatedAt   time.Time              `json:"createdAt"`
	UpdatedAt   time.Time              `json:"updatedAt"`
}

type AgentMessage struct {
	ID             string                 `json:"id,omitempty"`
	CompanyID      string                 `json:"companyId"`
	ProjectID      string                 `json:"projectId"`
	MigrationRunID string                 `json:"migrationRunId"`
	BandRoomID     string                 `json:"bandRoomId"`
	AgentName      string                 `json:"agentName"`
	MessageType    MessageType            `json:"messageType"`
	Phase          MigrationPhase         `json:"phase"`
	Summary        string                 `json:"summary"`
	Payload        map[string]interface{} `json:"payload"`
	Confidence     float64                `json:"confidence,omitempty"`
	RequiresAction bool                   `json:"requiresAction"`
	TargetAgent    string                 `json:"targetAgent,omitempty"`
	CreatedAt      time.Time              `json:"createdAt,omitempty"`
}

type MessageResponse struct {
	MessageID string    `json:"messageId"`
	CreatedAt time.Time `json:"createdAt"`
}

type MessageFilters struct {
	AgentName   string
	MessageType MessageType
	Phase       MigrationPhase
	Limit       int
	Offset      int
}

type Task struct {
	ID          string                 `json:"id,omitempty"`
	RoomID      string                 `json:"roomId"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	AssignedTo  string                 `json:"assignedTo"`
	Status      TaskStatus             `json:"status"`
	Priority    int                    `json:"priority"`
	Input       map[string]interface{} `json:"input"`
	Output      map[string]interface{} `json:"output,omitempty"`
	CreatedBy   string                 `json:"createdBy"`
	CreatedAt   time.Time              `json:"createdAt,omitempty"`
	UpdatedAt   time.Time              `json:"updatedAt,omitempty"`
}

type TaskResponse struct {
	TaskID    string    `json:"taskId"`
	CreatedAt time.Time `json:"createdAt"`
}

type TaskUpdate struct {
	Status TaskStatus             `json:"status"`
	Output map[string]interface{} `json:"output,omitempty"`
}

type TaskResult struct {
	Success bool                   `json:"success"`
	Output  map[string]interface{} `json:"output"`
	Error   string                 `json:"error,omitempty"`
}

type TaskFilters struct {
	AssignedTo string
	Status     TaskStatus
	Limit      int
	Offset     int
}

type Decision struct {
	ID            string                 `json:"id,omitempty"`
	RoomID        string                 `json:"roomId"`
	DecisionType  string                 `json:"decisionType"`
	DecisionMaker string                 `json:"decisionMaker"`
	Decision      string                 `json:"decision"`
	Rationale     string                 `json:"rationale"`
	Context       map[string]interface{} `json:"context"`
	CreatedAt     time.Time              `json:"createdAt,omitempty"`
}

type ContextSnapshot struct {
	RoomID     string                 `json:"roomId"`
	Data       map[string]interface{} `json:"data"`
	SnapshotAt time.Time              `json:"snapshotAt"`
}

type RoomFilters struct {
	CompanyID string
	Limit     int
	Offset    int
}
