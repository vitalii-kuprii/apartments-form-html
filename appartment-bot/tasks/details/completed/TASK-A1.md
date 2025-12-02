# TASK-A1: Initialize Project Structure

## Description
Set up the monorepo structure with TypeScript configuration, linting, and Docker for local development.

## Acceptance Criteria
- [ ] AC1: Monorepo structure created (bot/, web-app/ already exists, shared/)
- [ ] AC2: TypeScript configured for bot with strict mode
- [ ] AC3: ESLint + Prettier configured and working
- [ ] AC4: .env.example file created with all required variables
- [ ] AC5: Docker Compose running PostgreSQL and Redis locally
- [ ] AC6: npm scripts for dev, build, lint in place

## Project Structure
```
appartment-bot/
├── bot/                    # Backend: Telegram bot + API
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── bot/            # grammY bot handlers
│   │   ├── api/            # Fastify API routes
│   │   ├── services/       # Business logic
│   │   ├── jobs/           # BullMQ cron jobs
│   │   └── utils/          # Helpers
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── web-app/                # Frontend: Mini App (already exists)
├── shared/                 # Shared types/utils (optional for now)
├── docker-compose.yml      # PostgreSQL + Redis
├── .eslintrc.js
├── .prettierrc
└── package.json            # Root package.json (workspaces)
```

## Environment Variables (.env.example)
```
# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_URL=

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/apartment_bot

# Redis
REDIS_URL=redis://localhost:6379

# DOM RIA
DOMRIA_API_KEY=

# App
NODE_ENV=development
PORT=3000
```

## Docker Compose Services
- PostgreSQL 15 (port 5432)
- Redis 7 (port 6379)

## Implementation Steps
1. Create bot/ folder structure
2. Initialize package.json with dependencies
3. Configure TypeScript
4. Configure ESLint + Prettier
5. Create docker-compose.yml
6. Create .env.example
7. Verify everything works

## Dependencies to Install
```json
{
  "dependencies": {
    "grammy": "^1.21.0",
    "fastify": "^4.25.0",
    "@fastify/cors": "^8.5.0",
    "@prisma/client": "^5.7.0",
    "bullmq": "^5.1.0",
    "ioredis": "^5.3.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "prisma": "^5.7.0",
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.18.0",
    "@typescript-eslint/parser": "^6.18.0",
    "prettier": "^3.2.0"
  }
}
```

---
**Status**: Not Started
**Estimate**: 1-2 hours
