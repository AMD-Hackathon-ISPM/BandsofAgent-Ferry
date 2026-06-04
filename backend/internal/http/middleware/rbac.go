package middleware

import (
	"net/http"
)

type Role string

const (
	RoleOwner    Role = "owner"
	RoleAdmin    Role = "admin"
	RoleEngineer Role = "engineer"
	RoleReviewer Role = "reviewer"
)

var roleHierarchy = map[Role]int{
	RoleOwner:    4,
	RoleAdmin:    3,
	RoleEngineer: 2,
	RoleReviewer: 1,
}

func RequireRole(minRole Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userRole := GetRole(r.Context())
			if userRole == "" {
				respondError(w, http.StatusUnauthorized, "authentication required")
				return
			}

			userRoleLevel, ok := roleHierarchy[Role(userRole)]
			if !ok {
				respondError(w, http.StatusForbidden, "invalid role")
				return
			}

			minRoleLevel := roleHierarchy[minRole]
			if userRoleLevel < minRoleLevel {
				respondError(w, http.StatusForbidden, "insufficient permissions")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func RequireOwner(next http.Handler) http.Handler {
	return RequireRole(RoleOwner)(next)
}

func RequireAdmin(next http.Handler) http.Handler {
	return RequireRole(RoleAdmin)(next)
}

func RequireEngineer(next http.Handler) http.Handler {
	return RequireRole(RoleEngineer)(next)
}

func RequireReviewer(next http.Handler) http.Handler {
	return RequireRole(RoleReviewer)(next)
}
