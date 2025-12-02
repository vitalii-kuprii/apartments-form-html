# Apartment Bot (Квартирний Бот)

A Telegram bot for searching apartments for rent and purchase in Ukraine using DOM RIA as the primary data source.

## Overview

This bot helps users find apartments by:
1. Providing a Telegram Mini App interface for setting up search criteria
2. Fetching apartment listings from DOM RIA
3. Sending notifications about new matching apartments
4. Storing and managing user preferences and saved searches

## Tech Stack

### Backend
| Component   | Technology            |
|-------------|-----------------------|
| Language    | TypeScript            |
| Runtime     | Node.js               |
| Framework   | Fastify               |
| Bot Library | grammY                |
| Database    | PostgreSQL            |
| Cache       | Redis                 |
| Job Queue   | BullMQ                |
| ORM         | Prisma                |

### Observability
| Component   | Technology            |
|-------------|-----------------------|
| Logging     | Grafana Cloud Loki    |
| Metrics     | Prometheus (prom-client) |
| Queue UI    | Bull Board (/admin/queues) |

### Frontend (Telegram Mini App)
| Component   | Technology            |
|-------------|-----------------------|
| Language    | TypeScript            |
| Framework   | Vanilla (no framework)|
| Build Tool  | Vite                  |
| Styling     | CSS + Telegram UI Kit |

## Project Structure

```
appartment-bot/
├── src/
│   ├── bot/              # Telegram bot handlers
│   ├── api/              # REST API endpoints
│   ├── services/         # Business logic
│   │   ├── apartments/   # Apartment fetching & matching
│   │   ├── users/        # User management
│   │   ├── searches/     # Search criteria management
│   │   └── notifications/# Notification service
│   ├── jobs/             # Cron jobs & workers
│   ├── database/         # Database models & migrations
│   ├── scrapers/         # Web scraping for fallback
│   └── utils/            # Helpers & utilities
├── web-app/              # Telegram Mini App (search form UI)
├── prisma/               # Database schema & migrations
├── docker/               # Docker configuration
├── tasks/                # Project task tracking
├── docs/                 # Additional documentation
├── PLANNING.md           # Planning & decisions document
└── README.md
```

## Features

### MVP (Phase 1)
- [x] User registration via Telegram
- [x] Web App search form with filters
- [x] Save search criteria
- [x] Manual apartment search
- [x] Basic apartment display (photos, price, location)

### Phase 2
- [x] Automated notifications (BullMQ scheduler)
- [x] Multiple saved searches per user
- [x] Favorite apartments
- [ ] Price change alerts

### Phase 3
- [ ] AI-powered matching
- [ ] Map view in Mini App
- [ ] Analytics dashboard
- [ ] Premium features

## Data Sources

### Primary: DOM RIA API
- Official API for major cities (paid)
- Reliable, structured data
- Rate-limited based on subscription

### Fallback: Web Scraping
- For small cities or API unavailability
- Puppeteer-based scraping
- Proxy rotation for reliability

## Testing Strategy

| Component | Test Type | Tools |
|-----------|-----------|-------|
| Mini App UI | E2E tests | Playwright |
| API Endpoints | Integration tests | Vitest + Fastify inject |
| Telegram Bot | Unit tests (mocked context) | Vitest |
| Cron Jobs | Unit tests (logic separated from schedule) | Vitest |
| DOM RIA Client | Unit tests (mocked HTTP) | Vitest + MSW |

**Key principle for cron testing**: Separate job logic from scheduling - test the functions, not the schedule.

## Environment Variables

```env
# Telegram
TELEGRAM_BOT_TOKEN=
WEBAPP_URL=
ADMIN_IDS=

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/apartment_bot

# Redis
REDIS_URL=redis://localhost:6379

# DOM RIA API
DOMRIA_API_KEY=

# Grafana Cloud (Logging)
GRAFANA_LOKI_URL=https://logs-prod-012.grafana.net
GRAFANA_LOKI_USER=
GRAFANA_CLOUD_TOKEN=

# App
NODE_ENV=development
PORT=3000
```

