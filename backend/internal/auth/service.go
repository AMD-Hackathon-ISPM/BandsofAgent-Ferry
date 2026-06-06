package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ferry/backend/internal/db"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var (
	ErrInvalidCredentials  = errors.New("invalid credentials")
	ErrUserNotFound        = errors.New("user not found")
	ErrCompanyNotFound     = errors.New("company not found")
	ErrRefreshTokenExpired = errors.New("refresh token expired")
	ErrRefreshTokenInvalid = errors.New("refresh token invalid")
)

type Service struct {
	queries *db.Queries
	jwt     *JWTManager
	hasher  *PasswordHasher
}

func NewService(queries *db.Queries, jwt *JWTManager, hasher *PasswordHasher) *Service {
	return &Service{
		queries: queries,
		jwt:     jwt,
		hasher:  hasher,
	}
}

type RegisterCompanyInput struct {
	CompanyName string
	Email       string
	Password    string
	FullName    string
}

type RegisterCompanyOutput struct {
	CompanyID string
	UserID    string
	Tokens    *TokenPair
}

func (s *Service) RegisterCompany(ctx context.Context, input RegisterCompanyInput) (*RegisterCompanyOutput, error) {
	hashedPassword, err := s.hasher.Hash(input.Password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	companySlug := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(input.CompanyName), " ", "-"))
	company, err := s.queries.CreateCompany(ctx, input.CompanyName, companySlug, nil, nil, nil, []byte(`{}`))
	if err != nil {
		return nil, fmt.Errorf("failed to create company: %w", err)
	}

	user, err := s.queries.CreateUser(ctx, input.Email, hashedPassword, input.FullName, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	_, err = s.queries.CreateMembership(
		ctx,
		company.ID,
		user.ID,
		db.MembershipRoleOwner,
		pgtype.UUID{},
		pgtype.Timestamptz{Time: time.Now(), Valid: true},
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create membership: %w", err)
	}

	tokens, err := s.jwt.GenerateTokenPair(
		user.ID.String(),
		company.ID.String(),
		user.Email,
		string(db.MembershipRoleOwner),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	expiresAt := time.Now().Add(s.jwt.GetRefreshExpiration())
	_, err = s.queries.CreateRefreshToken(ctx, user.ID, tokens.RefreshToken, pgtype.Timestamptz{Time: expiresAt, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("failed to store refresh token: %w", err)
	}

	return &RegisterCompanyOutput{
		CompanyID: company.ID.String(),
		UserID:    user.ID.String(),
		Tokens:    tokens,
	}, nil
}

type LoginInput struct {
	Email    string
	Password string
}

type LoginOutput struct {
	UserID    string
	CompanyID string
	Role      string
	Tokens    *TokenPair
}

func (s *Service) Login(ctx context.Context, input LoginInput) (*LoginOutput, error) {
	user, err := s.queries.GetUserByEmail(ctx, input.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	valid, err := s.hasher.Verify(input.Password, user.PasswordHash)
	if err != nil {
		return nil, fmt.Errorf("failed to verify password: %w", err)
	}
	if !valid {
		return nil, ErrInvalidCredentials
	}

	memberships, err := s.queries.GetUserMemberships(ctx, user.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrCompanyNotFound
		}
		return nil, fmt.Errorf("failed to get membership: %w", err)
	}
	if len(memberships) == 0 {
		return nil, ErrCompanyNotFound
	}

	membership := memberships[0]
	tokens, err := s.jwt.GenerateTokenPair(
		user.ID.String(),
		membership.CompanyID.String(),
		user.Email,
		string(membership.Role),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	expiresAt := time.Now().Add(s.jwt.GetRefreshExpiration())
	_, err = s.queries.CreateRefreshToken(ctx, user.ID, tokens.RefreshToken, pgtype.Timestamptz{Time: expiresAt, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("failed to store refresh token: %w", err)
	}

	return &LoginOutput{
		UserID:    user.ID.String(),
		CompanyID: membership.CompanyID.String(),
		Role:      string(membership.Role),
		Tokens:    tokens,
	}, nil
}

func (s *Service) RefreshToken(ctx context.Context, refreshToken string) (*TokenPair, error) {
	storedToken, err := s.queries.GetRefreshToken(ctx, refreshToken)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrRefreshTokenInvalid
		}
		return nil, fmt.Errorf("failed to get refresh token: %w", err)
	}

	if storedToken.RevokedAt.Valid {
		return nil, ErrRefreshTokenInvalid
	}

	if !storedToken.ExpiresAt.Valid || time.Now().After(storedToken.ExpiresAt.Time) {
		return nil, ErrRefreshTokenExpired
	}

	user, err := s.queries.GetUserByID(ctx, storedToken.UserID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	memberships, err := s.queries.GetUserMemberships(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get membership: %w", err)
	}
	if len(memberships) == 0 {
		return nil, ErrCompanyNotFound
	}

	membership := memberships[0]
	tokens, err := s.jwt.GenerateTokenPair(
		user.ID.String(),
		membership.CompanyID.String(),
		user.Email,
		string(membership.Role),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	if err := s.queries.RevokeRefreshToken(ctx, refreshToken); err != nil {
		return nil, fmt.Errorf("failed to revoke old token: %w", err)
	}

	expiresAt := time.Now().Add(s.jwt.GetRefreshExpiration())
	_, err = s.queries.CreateRefreshToken(ctx, user.ID, tokens.RefreshToken, pgtype.Timestamptz{Time: expiresAt, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("failed to store new refresh token: %w", err)
	}

	return tokens, nil
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	if err := s.queries.RevokeRefreshToken(ctx, refreshToken); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("failed to revoke refresh token: %w", err)
	}
	return nil
}

func (s *Service) ValidateToken(tokenString string) (*Claims, error) {
	return s.jwt.ValidateAccessToken(tokenString)
}

type GitHubUserInfo struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

type GitHubLoginOutput struct {
	UserID    string
	CompanyID string
	Role      string
	Tokens    *TokenPair
}

func (s *Service) GitHubLogin(ctx context.Context, ghUser *GitHubUserInfo) (*GitHubLoginOutput, error) {
	name := ghUser.Name
	if name == "" {
		name = ghUser.Login
	}

	user, err := s.queries.GetUserByEmail(ctx, ghUser.Email)
	isNew := false
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) && !errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("failed to lookup user: %w", err)
		}
		isNew = true
		avatar := ghUser.AvatarURL
		user, err = s.queries.CreateUser(ctx, ghUser.Email, "", name, &avatar)
		if err != nil {
			return nil, fmt.Errorf("failed to create user: %w", err)
		}
	}

	var companyID string
	var role db.MembershipRole

	if isNew {
		slug := fmt.Sprintf("gh-%d", ghUser.ID)
		company, err := s.queries.CreateCompany(ctx, name+"'s Workspace", slug, nil, nil, nil, []byte(`{}`))
		if err != nil {
			return nil, fmt.Errorf("failed to create company: %w", err)
		}
		companyID = company.ID.String()
		role = db.MembershipRoleOwner
		_, err = s.queries.CreateMembership(
			ctx,
			company.ID,
			user.ID,
			role,
			pgtype.UUID{},
			pgtype.Timestamptz{Time: time.Now(), Valid: true},
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create membership: %w", err)
		}
	} else {
		memberships, err := s.queries.GetUserMemberships(ctx, user.ID)
		if err != nil || len(memberships) == 0 {
			slug := fmt.Sprintf("gh-%d", ghUser.ID)
			company, cerr := s.queries.CreateCompany(ctx, name+"'s Workspace", slug, nil, nil, nil, []byte(`{}`))
			if cerr != nil {
				return nil, fmt.Errorf("failed to create company: %w", cerr)
			}
			companyID = company.ID.String()
			role = db.MembershipRoleOwner
			_, _ = s.queries.CreateMembership(ctx, company.ID, user.ID, role, pgtype.UUID{}, pgtype.Timestamptz{Time: time.Now(), Valid: true})
		} else {
			companyID = memberships[0].CompanyID.String()
			role = memberships[0].Role
		}
	}

	tokens, err := s.jwt.GenerateTokenPair(user.ID.String(), companyID, user.Email, string(role))
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	expiresAt := time.Now().Add(s.jwt.GetRefreshExpiration())
	_, err = s.queries.CreateRefreshToken(ctx, user.ID, tokens.RefreshToken, pgtype.Timestamptz{Time: expiresAt, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("failed to store refresh token: %w", err)
	}

	_ = s.queries.UpdateUserLastLogin(ctx, user.ID)

	return &GitHubLoginOutput{
		UserID:    user.ID.String(),
		CompanyID: companyID,
		Role:      string(role),
		Tokens:    tokens,
	}, nil
}
