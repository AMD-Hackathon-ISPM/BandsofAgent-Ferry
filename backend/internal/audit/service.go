package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/netip"

	"github.com/ferry/backend/internal/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type Action string

const (
	ActionLogin              Action = "login"
	ActionLogout             Action = "logout"
	ActionRegisterCompany    Action = "registerCompany"
	ActionCreateProject      Action = "createProject"
	ActionUploadFile         Action = "uploadFile"
	ActionCreateMigrationRun Action = "createMigrationRun"
	ActionCreateBandRoom     Action = "createBandRoom"
	ActionCreateAgentMessage Action = "createAgentMessage"
	ActionCreatePR           Action = "createPr"
	ActionDownloadArtifact   Action = "downloadArtifact"
	ActionInviteUser         Action = "inviteUser"
	ActionUpdateRole         Action = "updateRole"
	ActionDeleteProject      Action = "deleteProject"
)

type Service struct {
	queries *db.Queries
}

func NewService(queries *db.Queries) *Service {
	return &Service{
		queries: queries,
	}
}

type LogInput struct {
	CompanyID  string
	UserID     string
	Action     Action
	ResourceID string
	Metadata   map[string]interface{}
	IPAddress  string
	UserAgent  string
}

func (s *Service) Log(ctx context.Context, input LogInput) error {
	companyUUID, err := uuid.Parse(input.CompanyID)
	if err != nil {
		return fmt.Errorf("invalid company ID: %w", err)
	}

	userUUID, err := uuid.Parse(input.UserID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	resourceUUID, err := uuid.Parse(input.ResourceID)
	if err != nil {
		return fmt.Errorf("invalid resource ID: %w", err)
	}

	metadataJSON, err := json.Marshal(input.Metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	var ipAddress *netip.Addr
	if input.IPAddress != "" {
		parsedIP := net.ParseIP(input.IPAddress)
		if parsedIP != nil {
			addr, ok := netip.AddrFromSlice(parsedIP)
			if ok {
				ipAddress = &addr
			}
		}
	}

	_, err = s.queries.CreateAuditLog(
		ctx,
		pgtype.UUID{Bytes: companyUUID, Valid: true},
		pgtype.UUID{Bytes: userUUID, Valid: true},
		toDbAuditAction(input.Action),
		nil,
		pgtype.UUID{Bytes: resourceUUID, Valid: true},
		metadataJSON,
		ipAddress,
		stringPtr(input.UserAgent),
	)
	if err != nil {
		return fmt.Errorf("failed to create audit log: %w", err)
	}

	return nil
}

func (s *Service) GetCompanyLogs(ctx context.Context, companyID string, limit int32) ([]db.AuditLog, error) {
	companyUUID, err := uuid.Parse(companyID)
	if err != nil {
		return nil, fmt.Errorf("invalid company ID: %w", err)
	}

	logs, err := s.queries.ListAuditLogs(ctx, pgtype.UUID{Bytes: companyUUID, Valid: true}, limit, 0)
	if err != nil {
		return nil, fmt.Errorf("failed to get audit logs: %w", err)
	}

	return logs, nil
}

func (s *Service) GetUserLogs(ctx context.Context, companyID, userID string, limit int32) ([]db.AuditLog, error) {
	companyUUID, err := uuid.Parse(companyID)
	if err != nil {
		return nil, fmt.Errorf("invalid company ID: %w", err)
	}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	logs, err := s.queries.ListAuditLogsByUser(
		ctx,
		pgtype.UUID{Bytes: companyUUID, Valid: true},
		pgtype.UUID{Bytes: userUUID, Valid: true},
		limit,
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get audit logs: %w", err)
	}

	return logs, nil
}

func (s *Service) GetResourceLogs(ctx context.Context, companyID, resourceID string, limit int32) ([]db.AuditLog, error) {
	companyUUID, err := uuid.Parse(companyID)
	if err != nil {
		return nil, fmt.Errorf("invalid company ID: %w", err)
	}

	resourceUUID, err := uuid.Parse(resourceID)
	if err != nil {
		return nil, fmt.Errorf("invalid resource ID: %w", err)
	}

	logs, err := s.queries.ListAuditLogsByResource(
		ctx,
		pgtype.UUID{Bytes: companyUUID, Valid: true},
		nil,
		pgtype.UUID{Bytes: resourceUUID, Valid: true},
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get audit logs: %w", err)
	}

	return logs, nil
}

func toDbAuditAction(action Action) db.AuditAction {
	switch action {
	case ActionLogin:
		return db.AuditActionUserLogin
	case ActionLogout:
		return db.AuditActionUserLogout
	case ActionRegisterCompany:
		return db.AuditActionSettingsChanged
	case ActionCreateProject:
		return db.AuditActionProjectCreated
	case ActionUploadFile:
		return db.AuditActionFileUploaded
	case ActionCreateMigrationRun:
		return db.AuditActionMigrationRunCreated
	case ActionCreateBandRoom:
		return db.AuditActionBandRoomCreated
	case ActionCreateAgentMessage:
		return db.AuditActionAgentMessageCreated
	case ActionCreatePR:
		return db.AuditActionPrCreated
	case ActionDownloadArtifact:
		return db.AuditActionArtifactDownloaded
	case ActionInviteUser:
		return db.AuditActionUserInvited
	case ActionUpdateRole:
		return db.AuditActionUserRoleChanged
	case ActionDeleteProject:
		return db.AuditActionSettingsChanged
	default:
		return db.AuditActionSettingsChanged
	}
}

func stringPtr(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
