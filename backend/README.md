# Ferry Backend

AI-assisted legacy modernization platform with multi-agent collaboration through Band.

## Overview

Ferry coordinates multiple specialized agents through Band to migrate legacy code and database schemas, generate tests, create GitHub PRs, and review migration quality.

### Supported Migrations

**Code:**
- COBOL → Go/Rust
- Java → Go/Rust  
- PHP → Go/Rust

**Database:**
- MySQL MyISAM → MySQL InnoDB

## Architecture

### Multi-Agent System

Ferry uses 9 specialized agents that collaborate through Band:

1. **Router Agent** - Creates migration plan and delegates tasks
2. **Source Analyzer Agent** - Analyzes source code structure
3. **Business Logic Agent** - Extracts business rules
4. **Target Code Generator Agent** - Generates Go/Rust code
5. **DB Migration Agent** - Plans MyISAM→InnoDB migration
6. **Test Generator Agent** - Creates test cases
7. **Reviewer Agent** - Reviews artifacts
8. **Migration Commander Agent** - Makes final decisions
9. **GitHub Connector Agent** - Creates PRs

### Band Integration

Band serves as the central collaboration hub where agents:
- Post structured messages
- Delegate tasks
- Hand off work
- Record decisions
- Share context

All Band messages are mirrored to the local database for UI display and auditability.

### Tech Stack

- **Language:** Go 1.21+
- **Database:** PostgreSQL 15
- **Cache/Queue:** Redis 7
- **Storage:** MinIO
- **Proxy:** Nginx
- **Router:** chi
- **Database:** pgx + sqlc
- **Migrations:** golang-migrate

## Quick Start

### Prerequisites

- Go 1.21+
- Docker & Docker Compose
- Make (optional)

### Setup

```bash
make setup
```

This will:
- Copy `.env.example` to `.env`
- Install Go dependencies
- Install golang-migrate
- Install sqlc

### Configuration

Edit `.env` with your settings:

```bash
DB_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret
MINIO_SECRET_KEY=your_minio_secret

BAND_PROVIDER=stub
IBM_MODEL_API_KEY=your_ibm_api_key
GITHUB_PAT=your_github_token
```

### Start Services

```bash
make docker-up
```

Wait for services to be healthy, then run migrations:

```bash
make migrate-up
```

### Run Development Server

```bash
make dev
```

API will be available at `http://localhost:8080`

## Project Structure

```
backend/
├── cmd/
│   └── api/              # Main application entry
├── internal/
│   ├── agents/           # Agent implementations
│   ├── auth/             # Authentication
│   ├── band/             # Band adapter
│   ├── company/          # Company management
│   ├── config/           # Configuration
│   ├── db/               # Database connection
│   │   └── queries/      # SQL queries for sqlc
│   ├── github/           # GitHub integration
│   ├── http/
│   │   ├── handlers/     # HTTP handlers
│   │   └── middleware/   # HTTP middleware
│   ├── migration/        # Migration orchestration
│   ├── models/           # AI model clients
│   ├── project/          # Project management
│   ├── queue/            # Redis queue
│   └── storage/          # MinIO storage
├── migrations/           # Database migrations
├── docker-compose.yml    # Docker services
├── Dockerfile            # Backend container
├── Makefile              # Development commands
└── README.md             # This file
```

## API Endpoints

### Authentication
- `POST /api/auth/register-company` - Register new company
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/me` - Current user info

### Company Management
- `GET /api/companies/current` - Current company details
- `GET /api/companies/current/members` - List members
- `POST /api/companies/current/invites` - Invite user

### Projects
- `POST /api/projects` - Create project
- `GET /api/projects` - List projects
- `GET /api/projects/{projectId}` - Get project details
- `POST /api/projects/{projectId}/files` - Upload source files
- `GET /api/projects/{projectId}/files` - List source files

### Migration Runs
- `POST /api/projects/{projectId}/migration-runs` - Create run
- `GET /api/projects/{projectId}/migration-runs` - List runs
- `GET /api/migration-runs/{runId}` - Get run details
- `GET /api/migration-runs/{runId}/agent-messages` - List agent messages
- `GET /api/migration-runs/{runId}/agent-timeline` - Get agent timeline
- `GET /api/migration-runs/{runId}/band-room` - Get Band room info
- `GET /api/migration-runs/{runId}/artifacts` - List artifacts

### GitHub Integration
- `POST /api/migration-runs/{runId}/create-pr` - Create GitHub PR
- `POST /api/migration-runs/{runId}/review-pr` - Review PR

### DB Migration
- `POST /api/db-migration/plan` - Create migration plan
- `GET /api/db-migration/plans/{planId}` - Get plan details

## Development

### Run Tests

```bash
make test
```

### Generate sqlc Code

```bash
make sqlc
```

### Create Migration

```bash
make migrate-create name=add_new_table
```

### View Logs

```bash
make docker-logs
```

### Clean Build Artifacts

```bash
make clean
```

## Multi-Tenant Isolation

Ferry enforces strict tenant isolation:

- All tenant-owned tables include `company_id`
- Repository layer always filters by `company_id`
- Never fetch resources by `id` alone
- Always use `company_id + id` composite queries
- Middleware validates company context from JWT

## Security

- JWT authentication with refresh tokens
- RBAC: owner, admin, engineer, reviewer
- Tenant isolation at all layers
- Audit logging for sensitive operations
- Input validation and sanitization
- Rate limiting via Nginx
- Encrypted secrets

## Band Collaboration Flow

```
1. Router Agent creates Band room
2. Router Agent posts migration plan
3. Source Analyzer Agent reads plan, posts analysis
4. Business Logic Agent reads analysis, posts business rules
5. Target Code Generator Agent generates code
6. DB Migration Agent plans database migration
7. Test Generator Agent creates tests
8. Reviewer Agent reviews all artifacts
9. Commander Agent makes final decision
10. GitHub Connector Agent creates PR
```

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables

- `DB_PASSWORD` - PostgreSQL password
- `JWT_SECRET` - JWT signing secret
- `MINIO_SECRET_KEY` - MinIO secret key

### Optional Variables

- `BAND_PROVIDER` - "stub" or "http" (default: stub)
- `BAND_API_KEY` - Band API key (if using http provider)
- `IBM_MODEL_API_KEY` - IBM model API key
- `GITHUB_PAT` - GitHub personal access token

## Troubleshooting

### Database Connection Failed

Check PostgreSQL is running:
```bash
docker-compose ps postgres
```

### Migrations Failed

Reset database:
```bash
make migrate-down
make migrate-up
```

### MinIO Connection Failed

Check MinIO is running and buckets are created:
```bash
docker-compose ps minio
make minio-init
```

## Contributing

1. Create feature branch
2. Make changes
3. Run tests: `make test`
4. Run linter: `make lint`
5. Submit pull request

## License

Proprietary - All rights reserved

## Support

For issues and questions, contact the development team.
