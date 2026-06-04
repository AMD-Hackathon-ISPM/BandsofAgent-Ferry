# HTTP Handlers

This directory contains HTTP request handlers for all API endpoints.

## Files to Implement

- `auth.go` - Authentication endpoints (register, login, refresh, logout)
- `company.go` - Company management endpoints
- `project.go` - Project CRUD endpoints
- `migration.go` - Migration run management
- `agent.go` - Agent messages and timeline
- `band.go` - Band room operations
- `artifact.go` - Artifact download and management
- `github.go` - GitHub integration endpoints
- `db_migration.go` - DB migration planner endpoints

## Handler Responsibilities

Each handler should:
- Parse and validate request input
- Extract user/company context from middleware
- Call appropriate service layer
- Log audit events
- Return JSON responses
- Handle errors appropriately