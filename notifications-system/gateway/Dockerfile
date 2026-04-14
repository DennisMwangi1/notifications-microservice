FROM golang:1.22-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

# Copy the entire module into the container context
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /gateway ./gateway

# Production
FROM alpine:3.19
RUN apk --no-cache add ca-certificates

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder /gateway /gateway

EXPOSE 8001

CMD ["/gateway"]
