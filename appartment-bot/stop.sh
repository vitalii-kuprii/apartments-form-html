#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Stopping all services...${NC}"

# Kill processes on ports
echo -e "Stopping Bot/API (port 3000)..."
lsof -ti:3000 | xargs kill -9 2>/dev/null

echo -e "Stopping Web App (port 5173)..."
lsof -ti:5173 | xargs kill -9 2>/dev/null

echo -e "Stopping Prisma Studio (port 5555)..."
lsof -ti:5555 | xargs kill -9 2>/dev/null

echo -e "Stopping ngrok (port 4040)..."
lsof -ti:4040 | xargs kill -9 2>/dev/null

# Kill by process name
echo -e "Cleaning up Node processes..."
pkill -f "tsx watch" 2>/dev/null
pkill -f "node.*vite" 2>/dev/null
pkill -f "prisma studio" 2>/dev/null
pkill -f "ngrok" 2>/dev/null

# Optionally stop Docker containers
read -p "Stop Docker containers (PostgreSQL/Redis)? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "Stopping Docker containers..."
    cd "$(dirname "${BASH_SOURCE[0]}")/bot"
    docker compose down
    echo -e "${GREEN}Docker containers stopped${NC}"
fi

echo -e "${GREEN}All services stopped${NC}"
