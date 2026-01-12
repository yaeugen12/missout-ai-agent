#!/bin/bash
# Start Missout Server
# This script ensures proper environment setup and starts the server

cd "$(dirname "$0")"

echo "Starting Missout Server..."
echo "Working directory: $(pwd)"

# Check if .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    exit 1
fi

# Start server using npx to ensure tsx is available
npx tsx src/index.ts
