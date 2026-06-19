.PHONY: help setup dev build test clean migrate-up migrate-down migrate-create sqlc docker-up docker-down docker-logs

help:
	@echo "Ferry Backend - Available Commands:"
	@echo ""
	@echo "  make setup          - Initial project setup (install tools, create .env)"
	@echo "  make dev            - Start development environment"
	@echo "  make build          - Build the application"
	@echo "  make test           - Run tests"
	@echo "  make clean          - Clean build artifacts"
	@echo ""
	@echo "  make migrate-up     - Run database migrations"
	@echo "  make migrate-down   - Rollback last migration"
	@echo "  make migrate-create - Create new migration (name=migration_name)"
	@echo "  make sqlc           - Generate sqlc code"
	@echo ""
	@echo "  make docker-up      - Start all Docker services"
	@echo "  make docker-down    - Stop all Docker services"
	@echo "  make docker-logs    - View Docker logs"
	@echo "  make docker-clean   - Remove all Docker volumes"
	@echo ""

setup:
	@echo "Setting up Ferry backend..."
	@if not exist .env (copy .env.example .env)
	@echo "Installing Go dependencies..."
	@go mod download
	@echo "Installing golang-migrate..."
	@go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	@echo "Installing sqlc..."
	@go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
	@echo "Setup complete! Edit .env file with your configuration."

dev:
	@echo "Starting development server..."
	@go run cmd/api/main.go

build:
	@echo "Building Ferry backend..."
	@go build -o ferry.exe cmd/api/main.go
	@echo "Build complete: ferry.exe"

test:
	@echo "Running tests..."
	@go test -v -race -coverprofile=coverage.txt -covermode=atomic ./...
	@echo "Generating coverage report..."
	@go tool cover -html=coverage.txt -o coverage.html
	@echo "Coverage report: coverage.html"

clean:
	@echo "Cleaning build artifacts..."
	@if exist ferry.exe del ferry.exe
	@if exist coverage.txt del coverage.txt
	@if exist coverage.html del coverage.html
	@echo "Clean complete!"

migrate-up:
	@echo "Running database migrations..."
	@migrate -path migrations -database "postgresql://ferry:ferry_dev_password@localhost:5432/ferry?sslmode=disable" up
	@echo "Migrations complete!"

migrate-down:
	@echo "Rolling back last migration..."
	@migrate -path migrations -database "postgresql://ferry:ferry_dev_password@localhost:5432/ferry?sslmode=disable" down 1
	@echo "Rollback complete!"

migrate-create:
	@if "$(name)"=="" (echo "Usage: make migrate-create name=migration_name" && exit 1)
	@echo "Creating migration: $(name)"
	@migrate create -ext sql -dir migrations -seq $(name)
	@echo "Migration files created in migrations/"

sqlc:
	@echo "Generating sqlc code..."
	@sqlc generate
	@echo "sqlc generation complete!"

docker-up:
	@echo "Starting Docker services..."
	@docker compose -f ..\docker-compose.yml up -d
	@echo "Services started! Waiting for health checks..."
	@timeout /t 10 /nobreak >nul
	@docker compose -f ..\docker-compose.yml ps

docker-down:
	@echo "Stopping Docker services..."
	@docker compose -f ..\docker-compose.yml down
	@echo "Services stopped!"

docker-logs:
	@docker compose -f ..\docker-compose.yml logs -f

docker-clean:
	@echo "WARNING: This will remove all Docker volumes and data!"
	@echo "Press Ctrl+C to cancel, or"
	@pause
	@docker compose -f ..\docker-compose.yml down -v
	@echo "Docker volumes removed!"

docker-build:
	@echo "Building Docker image..."
	@docker compose -f ..\docker-compose.yml build
	@echo "Docker image built!"

docker-migrate:
	@echo "Running migrations in Docker..."
	@docker compose -f ..\docker-compose.yml exec backend migrate -path /root/migrations -database "postgresql://ferry:ferry_dev_password@postgres:5432/ferry?sslmode=disable" up
	@echo "Migrations complete!"

minio-init:
	@echo "Initializing MinIO buckets..."
	@docker compose -f ..\docker-compose.yml exec minio mc alias set local http://localhost:9000 ferry ferry_dev_password
	@docker compose -f ..\docker-compose.yml exec minio mc mb local/ferry-source-files --ignore-existing
	@docker compose -f ..\docker-compose.yml exec minio mc mb local/ferry-artifacts --ignore-existing
	@docker compose -f ..\docker-compose.yml exec minio mc mb local/ferry-reports --ignore-existing
	@echo "MinIO buckets created!"

docker-setup: docker-up
	@echo "Waiting for services to be ready..."
	@timeout /t 15 /nobreak >nul
	@$(MAKE) docker-migrate
	@$(MAKE) minio-init
	@echo "Docker environment ready!"

lint:
	@echo "Running linters..."
	@go fmt ./...
	@go vet ./...
	@echo "Linting complete!"

security:
	@echo "Running security checks..."
	@go install github.com/securego/gosec/v2/cmd/gosec@latest
	@gosec ./...
	@echo "Security check complete!"

docs:
	@echo "Generating API documentation..."
	@echo "API documentation is in docs/API.md"

status:
	@echo "Ferry Backend Status:"
	@echo ""
	@echo "Go version:"
	@go version
	@echo ""
	@echo "Docker services:"
	@docker compose -f ..\docker-compose.yml ps
	@echo ""
	@echo "Database connection:"
	@psql postgresql://ferry:ferry_dev_password@localhost:5432/ferry -c "SELECT version();" 2>nul || echo "Database not accessible"

