# Apartment Bot - Planning & Decision Document

## Project Overview
A Telegram bot for searching apartments for rent/buy in Ukraine using DOM RIA as the primary data source.

---

## 1. TECHNOLOGY DECISIONS (FINAL)

### 1.1 Backend Stack
| Component | Decision | Reasoning |
|-----------|----------|-----------|
| Language | TypeScript | Type safety, familiar for AQA background |
| Runtime | Node.js | Mature ecosystem, excellent for I/O-bound tasks |
| Framework | **Fastify** | Fast, low overhead, good TypeScript support |
| Telegram Library | **grammY** | TypeScript-first, modern API, excellent middleware |
| Database | **PostgreSQL** | ACID, complex queries, relational data |
| Cache | **Redis** | Sessions, rate limiting, job queues |
| Job Queue | **BullMQ** | Redis-based, reliable cron support |
| ORM | **Prisma** | Best TypeScript DX, easy migrations |

### 1.2 Frontend Stack (Telegram Mini App)
| Component | Decision | Reasoning |
|-----------|----------|-----------|
| Language | TypeScript | Type safety, consistency with backend |
| Framework | **Vanilla (no framework)** | Simple UI, easy to understand, tiny bundle |
| Build Tool | **Vite** | Fast dev server, optimized builds |
| Styling | **CSS + Telegram UI Kit** | Native Telegram look and feel |

**Why Vanilla TS instead of React/Vue:**
- Only 3 simple pages (search, account, favorites)
- No framework overhead (~5-10kb vs 40kb+)
- Easier to debug (direct DOM manipulation)
- Familiar for AQA background (similar to Playwright/Cypress patterns)

---

## 2. ARCHITECTURE DECISIONS

### 2.1 System Components
```
┌─────────────────────────────────────────────────────────────────────┐
│                         TELEGRAM BOT SYSTEM                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐ │
│  │   Telegram   │────▶│   Bot API    │────▶│   Web App (Mini App) │ │
│  │    User      │◀────│   Server     │◀────│   Search Form UI     │ │
│  └──────────────┘     └──────────────┘     └──────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      MAIN API SERVER                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │  │
│  │  │ User        │  │ Search      │  │ Notification        │    │  │
│  │  │ Management  │  │ Management  │  │ Service             │    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐                 │
│         ▼                    ▼                    ▼                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐    │
│  │ PostgreSQL  │     │    Redis    │     │   Job Queue         │    │
│  │ - Users     │     │ - Sessions  │     │   (BullMQ)          │    │
│  │ - Searches  │     │ - Cache     │     │   - Cron jobs       │    │
│  │ - Apartments│     │ - Rate limit│     │   - Notifications   │    │ 
│  └─────────────┘     └─────────────┘     └─────────────────────┘    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                       DATA COLLECTION LAYER                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    APARTMENT FETCHER SERVICE                  │  │
│  │  ┌─────────────────────┐    ┌────────────────────────────┐    │  │
│  │  │ DOM RIA API Client  │    │ Web Scraper (Puppeteer)    │    │  │
│  │  │ (Paid API for major │    │ (For small cities/backup)  │    │  │
│  │  │  cities)            │    │ + Proxy rotation           │    │  │
│  │  └─────────────────────┘    └────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Deployment Architecture Options

#### Option A: Single VPS (Recommended for start)
```
VPS (4GB RAM, 2 CPU)
├── Docker Compose
│   ├── Bot + API Container
│   ├── PostgreSQL Container
│   ├── Redis Container
│   └── Worker Container (cron jobs)
```
**Cost**: ~$20-40/month
**Pros**: Simple, all-in-one, easy to manage
**Cons**: Single point of failure

#### Option B: Managed Services
```
├── Railway / Render / Fly.io (App hosting)
├── Supabase / Neon (PostgreSQL)
├── Upstash (Redis)
└── Separate worker on same platform
```
**Cost**: ~$30-60/month (can start free tier)
**Pros**: No server management, auto-scaling
**Cons**: More services to manage, potential vendor lock-in

#### Option C: Cloud Provider (AWS/GCP)
```
├── EC2/Compute Engine
├── RDS (PostgreSQL)
├── ElastiCache (Redis)
└── CloudWatch (Monitoring)
```
**Cost**: ~$50-100/month
**Pros**: Scalable, reliable
**Cons**: More complex, overkill for start

**Recommendation**: Start with Option A (VPS + Docker), migrate to Option B/C when needed.

---

## 3. FEATURE DECISIONS

### 3.1 MVP Features (Phase 1)
| Feature | Priority | Notes |
|---------|----------|-------|
| User registration via Telegram | MUST | Auto-register on /start |
| Web App search form | MUST | Mini App with filters |
| Save search criteria | MUST | Store in DB |
| Manual search trigger | MUST | User requests apartments on demand |
| Basic apartment display | MUST | Photos, price, location, link |

### 3.2 Phase 2 Features
| Feature | Priority | Notes |
|---------|----------|-------|
| Scheduled notifications | HIGH | Every 2 hours check |
| Multiple saved searches | HIGH | Up to 3-5 per user |
| Favorite apartments | MEDIUM | Save liked listings |
| Price change alerts | MEDIUM | Notify if price drops |

### 3.3 Phase 3 Features
| Feature | Priority | Notes |
|---------|----------|-------|
| AI-powered matching | LOW | Better recommendations |
| Map view in Mini App | LOW | Visual apartment locations |
| Statistics/Analytics | LOW | User engagement metrics |
| Premium features | LOW | Monetization |

---

## 4. QUESTIONS TO RESOLVE

### 4.1 Technical Questions
- [ ] **DOM RIA API**: Do they have official API? What are the limits/pricing?
- [ ] **Web scraping legality**: Check DOM RIA ToS for scraping small cities
- [ ] **Proxy provider**: Which one to use? (Bright Data, Smartproxy, residential proxies)
- [ ] **Rate limiting**: How many requests can we make to DOM RIA?

### 4.2 Product Questions
- [ ] **User limits**: Max searches per user? Max notifications per day?
- [ ] **Data retention**: How long to keep apartment data? (Listings expire)
- [ ] **Language**: Ukrainian only? Or multilingual?
- [ ] **Monetization**: Free forever? Freemium? When to introduce?

### 4.3 Infrastructure Questions
- [ ] **Domain**: Need a domain for Web App? (Required for Telegram Mini Apps)
- [ ] **SSL**: Let's Encrypt or managed?
- [ ] **Monitoring**: What to use? (Grafana, Sentry, simple healthchecks)
- [ ] **Backups**: Database backup strategy?

---

## 5. DOM RIA INTEGRATION

### 5.1 Research Needed
1. **Official API**: Check https://developers.ria.com/ for apartment API
2. **API Pricing**: Determine cost per request
3. **Data available**: What fields can we get? (Photos, price history, etc.)
4. **Rate limits**: Requests per second/minute/day

### 5.2 Scraping Fallback Strategy
For cities not covered by paid API or to reduce costs:

```
Priority order:
1. DOM RIA Official API (if available and affordable)
2. DOM RIA undocumented API (reverse-engineer mobile app)
3. Web scraping with Puppeteer + residential proxies
```

### 5.3 Proxy Rotation Strategy
```typescript
// Example approach
const proxyProviders = [
  'bright-data',      // Premium, reliable
  'smartproxy',       // Good for Ukraine
  'webshare',         // Budget option
];

// Rotate IPs per request
// Use residential IPs for better success rate
// Implement retry logic with different IPs
```

---

## 6. DATABASE SCHEMA (Draft)

```sql
-- Users
users (
  id, telegram_id, telegram_username,
  language, created_at, last_active_at
)

-- Search criteria
searches (
  id, user_id, name,
  city, district[],
  type (rent/buy),
  price_min, price_max,
  rooms_min, rooms_max,
  area_min, area_max,
  is_active, notification_enabled,
  created_at, updated_at
)

-- Apartments cache
apartments (
  id, external_id, source,
  city, district, address,
  type, price, rooms, area,
  photos[], description,
  url,
  first_seen_at, last_seen_at,
  is_active
)

-- User notifications history
notifications (
  id, user_id, search_id, apartment_id,
  sent_at, clicked
)

-- User favorites
favorites (
  id, user_id, apartment_id, created_at
)
```

---

## 7. CRON JOB STRATEGY

### 7.1 Job Types
| Job | Frequency | Description |
|-----|-----------|-------------|
| Fetch apartments | Every 1-2 hours | Get new listings from DOM RIA |
| Send notifications | Every 2 hours | Match new apartments to user searches |
| Cleanup old data | Daily | Remove expired listings |
| Health check | Every 5 min | Monitor system status |

### 7.2 Cost Optimization
```
Strategy to minimize paid API calls:

1. Fetch by CITY, not by user search
   - Group all searches by city
   - One API call per city, not per user

2. Cache aggressively
   - Store all apartments in DB
   - Match against user criteria locally

3. Smart polling
   - Popular cities: every 1 hour
   - Less popular: every 3-4 hours
   - Night time: less frequent
```

---

## 8. TESTING STRATEGY

### 8.1 Testing by Component

| Component | Test Type | Tools | Approach |
|-----------|-----------|-------|----------|
| Mini App UI | E2E | Playwright | Real browser tests |
| API Endpoints | Integration | Vitest + Fastify inject | Test DB, no HTTP server |
| Telegram Bot | Unit | Vitest | Mock Telegram context |
| Cron Jobs | Unit | Vitest | Test logic, mock dependencies |
| DOM RIA Client | Unit | Vitest + MSW | Mock HTTP responses |

### 8.2 Cron Testing Approach

**Key principle**: Separate job logic from scheduling

```
Schedule (BullMQ)  →  Job Function  →  Side Effects
     ↑                     ↑               ↑
 Don't test            TEST THIS       Mock these
```

- Extract business logic into standalone functions
- Test functions directly with mocked dependencies
- Don't test that BullMQ runs on schedule (trust the library)

### 8.3 Test Structure

```
tests/
├── api/           # API endpoint tests
├── bot/           # Bot command/callback tests
├── jobs/          # Cron job logic tests
├── services/      # Service layer tests
└── setup.ts       # Test configuration
```

---

## 9. NEXT STEPS

### Immediate Actions
1. [ ] Research DOM RIA API availability and pricing
2. [ ] Choose hosting provider
3. [ ] Set up development environment

### Development Order
1. [ ] Phase A: Project Setup
2. [ ] Phase B: Mini App UI (via BOLT AI)
3. [ ] Phase C: Telegram Bot Foundation
4. [ ] Phase D: Database & API
5. [ ] Phase E: Bot + UI Integration
6. [ ] Phase F: Apartment Fetching
7. [ ] Phase G: Background Jobs & Notifications
8. [ ] Phase H: Scraping Fallback
9. [ ] Phase I: Deployment & DevOps

See `tasks/TASKS.md` for detailed task breakdown.

---

## 10. Decision Summary Table

| Decision | Your Choice | Status |
|----------|-------------|--------|
| Backend Framework | Fastify | DECIDED |
| Telegram Library | grammY | DECIDED |
| Database | PostgreSQL + Redis | DECIDED |
| ORM | Prisma | DECIDED |
| Job Queue | BullMQ | DECIDED |
| Frontend Framework | Vanilla TypeScript | DECIDED |
| Frontend Build Tool | Vite | DECIDED |
| Hosting | VPS / Managed / Cloud | TO DECIDE |
| Proxy Provider | Bright Data / Smartproxy | TO DECIDE |
