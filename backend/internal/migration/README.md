# Migration Service

This directory contains business logic for migration run management and orchestration.

## Files to Implement

- `service.go` - Migration service with business logic
- `orchestrator.go` - Migration workflow orchestration
- `types.go` - Migration-related types and DTOs

## Responsibilities

- Migration run creation and management
- Band room creation for each run
- File upload to MinIO
- Job enqueuing to Redis
- Agent orchestration and execution
- Phase transition management
- Status tracking and updates
- Error handling and recovery
- Artifact collection and storage