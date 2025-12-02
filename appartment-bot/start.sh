#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Apartment Bot - Startup Script${NC}"
echo -e "${BLUE}========================================${NC}"

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$SCRIPT_DIR/bot"
WEB_APP_DIR="$SCRIPT_DIR/web-app"

# Function to check if a port is in use
check_port() {
    lsof -ti:$1 > /dev/null 2>&1
}

# Function to wait for a port to be available
wait_for_port() {
    local port=$1
    local max_attempts=${2:-30}
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if check_port $port; then
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    return 1
}

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"

    # Kill background processes
    if [ ! -z "$BOT_PID" ]; then
        kill $BOT_PID 2>/dev/null
    fi
    if [ ! -z "$WEBAPP_PID" ]; then
        kill $WEBAPP_PID 2>/dev/null
    fi
    if [ ! -z "$NGROK_PID" ]; then
        kill $NGROK_PID 2>/dev/null
    fi
    if [ ! -z "$PRISMA_PID" ]; then
        kill $PRISMA_PID 2>/dev/null
    fi

    # Kill any remaining processes on our ports
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    lsof -ti:5555 | xargs kill -9 2>/dev/null

    echo -e "${GREEN}Cleanup complete${NC}"
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM

# Step 1: Kill any existing processes on our ports
echo -e "\n${YELLOW}Step 1: Cleaning up existing processes...${NC}"
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:5555 | xargs kill -9 2>/dev/null
pkill -f "tsx watch" 2>/dev/null
pkill -f "node.*vite" 2>/dev/null
sleep 2
echo -e "${GREEN}Done${NC}"

# Step 2: Check if Docker is running
echo -e "\n${YELLOW}Step 2: Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running!${NC}"
    echo -e "${YELLOW}Please start Docker Desktop and run this script again.${NC}"
    exit 1
fi
echo -e "${GREEN}Docker is running${NC}"

# Step 3: Start Docker containers
echo -e "\n${YELLOW}Step 3: Starting Docker containers (PostgreSQL + Redis)...${NC}"
cd "$BOT_DIR"
docker compose up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}PostgreSQL is ready${NC}"
        break
    fi
    sleep 1
    attempt=$((attempt + 1))
    echo -n "."
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "\n${RED}PostgreSQL failed to start in time${NC}"
    exit 1
fi

# Wait for Redis to be ready
echo -e "${YELLOW}Waiting for Redis to be ready...${NC}"
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}Redis is ready${NC}"
        break
    fi
    sleep 1
    attempt=$((attempt + 1))
    echo -n "."
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "\n${RED}Redis failed to start in time${NC}"
    exit 1
fi

# Step 4: Run Prisma migrations
echo -e "\n${YELLOW}Step 4: Running database migrations...${NC}"
cd "$BOT_DIR"
npx prisma migrate deploy
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to run migrations${NC}"
    exit 1
fi
echo -e "${GREEN}Migrations complete${NC}"

# Step 5: Generate Prisma client (if needed)
echo -e "\n${YELLOW}Step 5: Generating Prisma client...${NC}"
npx prisma generate
echo -e "${GREEN}Prisma client generated${NC}"

# Step 6: Start the Bot/API server
echo -e "\n${YELLOW}Step 6: Starting Bot/API server...${NC}"
cd "$BOT_DIR"
npm run dev > /tmp/bot.log 2>&1 &
BOT_PID=$!

# Wait for API server to be ready
echo -e "${YELLOW}Waiting for API server...${NC}"
if wait_for_port 3000 30; then
    echo -e "${GREEN}Bot/API server is running on http://localhost:3000${NC}"
else
    echo -e "${RED}Bot/API server failed to start${NC}"
    cat /tmp/bot.log
    exit 1
fi

# Step 7: Start the Web App (Vite)
echo -e "\n${YELLOW}Step 7: Starting Web App...${NC}"
cd "$WEB_APP_DIR"
npm run dev -- --host > /tmp/webapp.log 2>&1 &
WEBAPP_PID=$!

# Wait for Vite to be ready
echo -e "${YELLOW}Waiting for Vite dev server...${NC}"
if wait_for_port 5173 30; then
    echo -e "${GREEN}Web App is running on http://localhost:5173${NC}"
else
    echo -e "${RED}Web App failed to start${NC}"
    cat /tmp/webapp.log
    exit 1
fi

# Step 8: Start ngrok tunnel
echo -e "\n${YELLOW}Step 8: Starting ngrok tunnel...${NC}"
ngrok http 5173 --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!
sleep 3

# Get ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | sed 's/"public_url":"//')

if [ -z "$NGROK_URL" ]; then
    echo -e "${RED}Failed to get ngrok URL. Check if ngrok is installed and authenticated.${NC}"
    echo -e "${YELLOW}You can manually start ngrok with: ngrok http 5173${NC}"
else
    echo -e "${GREEN}ngrok tunnel: $NGROK_URL${NC}"

    # Update bot's WEBAPP_URL
    echo -e "\n${YELLOW}Updating WEBAPP_URL in bot .env...${NC}"
    if [ -f "$BOT_DIR/.env" ]; then
        # Update or add WEBAPP_URL
        if grep -q "^WEBAPP_URL=" "$BOT_DIR/.env"; then
            sed -i '' "s|^WEBAPP_URL=.*|WEBAPP_URL=$NGROK_URL|" "$BOT_DIR/.env"
        else
            echo "WEBAPP_URL=$NGROK_URL" >> "$BOT_DIR/.env"
        fi
        echo -e "${GREEN}WEBAPP_URL updated to $NGROK_URL${NC}"

        # Restart bot to pick up new URL
        echo -e "${YELLOW}Restarting bot to apply new WEBAPP_URL...${NC}"
        kill $BOT_PID 2>/dev/null
        sleep 2
        cd "$BOT_DIR"
        npm run dev > /tmp/bot.log 2>&1 &
        BOT_PID=$!
        sleep 3
        echo -e "${GREEN}Bot restarted${NC}"
    fi
fi

# Step 9: Start Prisma Studio (optional)
echo -e "\n${YELLOW}Step 9: Starting Prisma Studio...${NC}"
cd "$BOT_DIR"
npx prisma studio > /tmp/prisma-studio.log 2>&1 &
PRISMA_PID=$!
sleep 3
echo -e "${GREEN}Prisma Studio running on http://localhost:5555${NC}"

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}All services are running!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e ""
echo -e "Services:"
echo -e "  ${GREEN}✓${NC} PostgreSQL:    localhost:5432"
echo -e "  ${GREEN}✓${NC} Redis:         localhost:6379"
echo -e "  ${GREEN}✓${NC} Bot/API:       http://localhost:3000"
echo -e "  ${GREEN}✓${NC} Web App:       http://localhost:5173"
echo -e "  ${GREEN}✓${NC} Prisma Studio: http://localhost:5555"
if [ ! -z "$NGROK_URL" ]; then
    echo -e "  ${GREEN}✓${NC} ngrok:         $NGROK_URL"
fi
echo -e ""
echo -e "Logs:"
echo -e "  Bot:          /tmp/bot.log"
echo -e "  Web App:      /tmp/webapp.log"
echo -e "  ngrok:        /tmp/ngrok.log"
echo -e "  Prisma:       /tmp/prisma-studio.log"
echo -e ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo -e ""

# Keep script running and show bot logs
tail -f /tmp/bot.log
