package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/ferry/backend/internal/auth"
)

type contextKey string

const (
	UserIDKey    contextKey = "userId"
	CompanyIDKey contextKey = "companyId"
	EmailKey     contextKey = "email"
	RoleKey      contextKey = "role"
	IsGuestKey   contextKey = "isGuest"
)

type AuthMiddleware struct {
	authService *auth.Service
}

func NewAuthMiddleware(authService *auth.Service) *AuthMiddleware {
	return &AuthMiddleware{
		authService: authService,
	}
}

func (m *AuthMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			respondError(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			respondError(w, http.StatusUnauthorized, "invalid authorization header format")
			return
		}

		token := parts[1]
		claims, err := m.authService.ValidateToken(token)
		if err != nil {
			if err == auth.ErrExpiredToken {
				respondError(w, http.StatusUnauthorized, "token expired")
				return
			}
			respondError(w, http.StatusUnauthorized, "invalid token")
			return
		}

		ctx := r.Context()
		ctx = context.WithValue(ctx, UserIDKey, claims.UserID)
		ctx = context.WithValue(ctx, CompanyIDKey, claims.CompanyID)
		ctx = context.WithValue(ctx, EmailKey, claims.Email)
		ctx = context.WithValue(ctx, RoleKey, claims.Role)
		ctx = context.WithValue(ctx, IsGuestKey, claims.IsGuest)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUserID(ctx context.Context) string {
	if userID, ok := ctx.Value(UserIDKey).(string); ok {
		return userID
	}
	return ""
}

func GetCompanyID(ctx context.Context) string {
	if companyID, ok := ctx.Value(CompanyIDKey).(string); ok {
		return companyID
	}
	return ""
}

func GetEmail(ctx context.Context) string {
	if email, ok := ctx.Value(EmailKey).(string); ok {
		return email
	}
	return ""
}

func GetRole(ctx context.Context) string {
	if role, ok := ctx.Value(RoleKey).(string); ok {
		return role
	}
	return ""
}

func IsGuest(ctx context.Context) bool {
	isGuest, _ := ctx.Value(IsGuestKey).(bool)
	return isGuest
}
