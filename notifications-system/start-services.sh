#!/bin/bash

echo "🚀 Starting Notifications Microservice..."

# Get absolute path to the directory containing this script
SYSTEM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

# Start NestJS Worker
echo "📦 Starting NestJS Worker..."
cd "$SYSTEM_DIR/worker"
npm install # Ensure packages are installed just in case
npm run start:dev &
WORKER_PID=$!

# Wait just a second so logs don't completely overlap at the first millisecond
sleep 2

# Start Go Gateway
echo "🐹 Starting Go Gateway..."
cd "$SYSTEM_DIR/gateway"
go run main.go &
GATEWAY_PID=$!

echo "========================================="
echo "✅ Both services are starting up."
echo "   Worker PID: $WORKER_PID"
echo "   Gateway PID: $GATEWAY_PID"
echo "   Press Ctrl+C to stop both services gracefully."
echo "========================================="

# Function to gracefully stop both services
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    
    # Send SIGTERM to both
    kill -TERM $GATEWAY_PID 2>/dev/null
    kill -TERM $WORKER_PID 2>/dev/null
    
    # Wait for them to finish shutting down
    wait $GATEWAY_PID 2>/dev/null
    wait $WORKER_PID 2>/dev/null
    
    echo "✅ All services stopped successfully."
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

# Wait indefinitely on the background processes so the script stays alive
wait $WORKER_PID $GATEWAY_PID
