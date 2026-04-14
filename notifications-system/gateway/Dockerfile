FROM golang:1.22-alpine AS builder
WORKDIR /app

# Copy the entire build context into a temporary workspace
COPY . /workspace

# Dynamically detect if Dokploy is executing this from the Repository Root (/) 
# or from the /notifications-system folder, and build accordingly.
RUN if [ -f "/workspace/notifications-system/go.mod" ]; then \
        echo "Detected Context: Repository Root" && \
        cd /workspace/notifications-system && \
        go mod download && \
        CGO_ENABLED=0 GOOS=linux go build -o /gateway ./gateway; \
    elif [ -f "/workspace/go.mod" ]; then \
        echo "Detected Context: /notifications-system" && \
        cd /workspace && \
        go mod download && \
        CGO_ENABLED=0 GOOS=linux go build -o /gateway ./gateway; \
    else \
        echo "ERROR: go.mod not found! Your Dokploy Build Path is set too deep (e.g. /gateway). Please set Build Path to '/' or '/notifications-system'" && \
        exit 1; \
    fi

# Production
FROM alpine:3.19
RUN apk --no-cache add ca-certificates

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder /gateway /gateway

EXPOSE 8001

CMD ["/gateway"]
