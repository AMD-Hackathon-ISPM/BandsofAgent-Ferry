FROM golang:1.25-bookworm

RUN apt-get update \
	&& apt-get install -y --no-install-recommends nodejs npm ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/frontend

COPY frontend/package.json frontend/package-lock.json ./

RUN npm ci

RUN go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest

COPY backend /workspace/backend
COPY frontend /workspace/frontend

ENV PATH="/go/bin:${PATH}"
ENV FERRY_REPO_ROOT="/workspace"
ENV FERRY_BACKEND_DIR="/workspace/backend"
ENV FERRY_BACKEND_URL="http://backend:8080"

CMD ["npm", "run", "dev"]
