FROM golang:1.26.4-alpine AS builder

RUN apk add --no-cache git make

WORKDIR /app

COPY go.mod go.sum* ./

RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o ferry ./cmd/api && \
    CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o ferry-agents ./cmd/agents && \
    CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o ferry-runner ./cmd/runner

FROM alpine:latest

# docker-cli lets the agents launch ephemeral sandbox containers via the host
# Docker socket (mounted in docker-compose) for code execution. git is used by
# the workers to shallow-clone source repos before building the prompt digest.
RUN apk --no-cache add ca-certificates docker-cli git

WORKDIR /root/

COPY --from=builder /app/ferry .
COPY --from=builder /app/ferry-agents .
COPY --from=builder /app/ferry-runner .

COPY --from=builder /app/migrations ./migrations

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["./ferry"]
