package middleware

import (
	"net/http"
)

type TenantMiddleware struct{}

func NewTenantMiddleware() *TenantMiddleware {
	return &TenantMiddleware{}
}

func (m *TenantMiddleware) EnforceTenantIsolation(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyID(r.Context())
		if companyID == "" {
			respondError(w, http.StatusUnauthorized, "company context required")
			return
		}

		next.ServeHTTP(w, r)
	})
}
