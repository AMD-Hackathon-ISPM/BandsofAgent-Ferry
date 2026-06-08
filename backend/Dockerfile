FROM golang:1.26.4-alpine AS builder

RUN apk add --no-cache git make

WORKDIR /app

COPY go.mod go.sum* ./

RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o ferry ./cmd/api && \
    CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o ferry-agents ./cmd/agents

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=builder /app/ferry .
COPY --from=builder /app/ferry-agents .

COPY --from=builder /app/migrations ./migrations

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["./ferry"]
