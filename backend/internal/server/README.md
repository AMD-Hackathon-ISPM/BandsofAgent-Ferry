# HTTP Server

This directory contains HTTP server setup and routing.

## Files to Implement

- `server.go` - HTTP server initialization and configuration
- `router.go` - Route definitions and middleware chain

## Responsibilities

- HTTP server setup with chi router
- Middleware chain configuration:
  - CORS
  - Request logging
  - Authentication
  - RBAC
  - Tenant isolation
  - Rate limiting
  - Recovery
- Route registration for all endpoints
- Graceful shutdown handling