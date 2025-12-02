# Project Tasks

## How to Use This File

Each task follows this format:
- `[ ]` = Not started
- `[~]` = In progress
- `[x]` = Completed
- `[-]` = Cancelled

Before implementing a task, create a detailed file in `tasks/details/TASK-XX.md` with Acceptance Criteria.

---

## PHASE A: Project Setup

### TASK-A1: Initialize Project Structure
- [x] Create monorepo structure (bot/, web-app/, shared/)
- [x] Set up TypeScript config
- [x] Configure ESLint + Prettier
- [x] Create .env.example file
- [x] Set up Docker Compose for local dev (PostgreSQL, Redis)

---

## PHASE B: Mini App UI (via BOLT AI)

### TASK-B1: Setup Frontend Project
- [x] Initialize Vite + Vanilla TypeScript
- [x] Configure build for Telegram Mini App
- [x] Integrate Telegram Mini App SDK
- [x] Set up styling

### TASK-B2: Search Form Page
- [x] Create search form layout
- [x] Implement city/district selection
- [x] Add price range filters (min/max)
- [x] Add rooms filter
- [x] Add area filter (min/max)
- [x] Add property type filter (rent/buy)
- [x] Form validation

### TASK-B3: Saved Searches Page
- [x] List user's saved searches
- [x] Edit search functionality
- [x] Delete search functionality
- [x] Toggle notifications per search

### TASK-B4: Favorites Page
- [x] List favorited apartments
- [x] Remove from favorites
- [x] View apartment details

### TASK-B5: User Account Page
- [x] Display user info
- [x] Notification preferences
- [ ] Language selection (future)

---

## PHASE C: Telegram Bot Foundation

### TASK-C1: Create Bot
- [x] Create bot via BotFather
- [x] Get bot token
- [x] Set bot description and commands

### TASK-C2: Bot Setup
- [x] Initialize grammY project
- [x] Implement /start command
- [x] Implement /help command
- [x] Set up webhook/polling for development

### TASK-C3: Search Creation Methods (CRITICAL)
User must have 3 ways to create a search:

**Method 1: Open Web App (Priority)**
- [x] Button to open Mini App
- [ ] Receive and save search data from Mini App (requires API - Phase D)

**Method 2: Paste DOM RIA Link**
- [-] Moved to TASK-C4 (Future)

**Method 3: Telegram Native UI**
- [x] /search command
- [x] Inline keyboard wizard (city → type → price → rooms)
- [ ] Confirm and save (requires API - Phase D)

### TASK-C4: Parse DOM RIA URL (Future)
- [ ] Detect DOM RIA URL in message
- [ ] Parse filters from URL (city, price, rooms, etc.)
- [ ] Confirm parsed filters with user
- [ ] Save search

---

## PHASE D: Database & API

### TASK-D1: Database Setup
- [x] Set up PostgreSQL with Docker
- [x] Initialize Prisma
- [x] Design database schema
- [x] Create initial migrations
- [x] Set up Redis connection

### TASK-D2: API Server Setup
- [x] Initialize Fastify server
- [x] Configure CORS for Mini App
- [x] Set up authentication (Telegram Mini App auth)
- [x] Create health check endpoint

### TASK-D3: User API
- [x] POST /api/auth - authenticate user from Mini App
- [x] GET /api/user - get user profile
- [x] PUT /api/user - update preferences

### TASK-D4: Searches API
- [x] POST /api/searches - create search
- [x] GET /api/searches - list user searches
- [x] GET /api/searches/:id - get search details
- [x] PUT /api/searches/:id - update search
- [x] DELETE /api/searches/:id - delete search

### TASK-D5: Apartments API
- [x] GET /api/apartments - search apartments
- [x] GET /api/apartments/:id - apartment details
- [x] POST /api/favorites - add to favorites
- [x] GET /api/favorites - list favorites
- [x] DELETE /api/favorites/:id - remove from favorites

---

## PHASE E: Bot + UI Integration

### TASK-E1: User Registration Flow
- [x] Save user to DB on /start
- [ ] 
- [x] Welcome message with Mini App button

### TASK-E2: Mini App Integration
- [x] Validate Telegram Mini App init data
- [x] Pass user context to Mini App
- [ ] Handle Mini App close events

### TASK-E3: Bot Commands
- [x] /search - wizard saves to DB
- [ ] /searches - list saved searches
- [ ] /favorites - list favorites
- [ ] /settings - user settings
- [ ] /stop - pause notifications

---

## PHASE F: Apartment Fetching (DOM RIA)

### TASK-F1: DOM RIA Client
- [ ] Create API client class
- [ ] Implement authentication
- [ ] Handle rate limiting
- [ ] Implement retry logic

### TASK-F2: Apartment Fetching
- [ ] Fetch apartments by city
- [ ] Fetch apartments by filters
- [ ] Parse and normalize response
- [ ] Handle pagination

### TASK-F3: Apartment Storage
- [ ] Store apartments in database
- [ ] Implement deduplication (by external_id)
- [ ] Track first_seen_at, last_seen_at
- [ ] Mark inactive apartments

### TASK-F4: Search Matching
- [ ] Match new apartments to user searches
- [ ] Efficient query with indexes
- [ ] Track which apartments were shown to user

---

## PHASE G: Background Jobs & Notifications

### TASK-G1: Job Queue Setup
- [ ] Set up BullMQ with Redis
- [ ] Create Bull Board dashboard (optional)
- [ ] Define job types

### TASK-G2: Apartment Fetch Cron
- [ ] Schedule fetch jobs by city
- [ ] Big cities: every 3-5 minutes
- [ ] Small cities: every 1 hour
- [ ] Implement concurrency limits

### TASK-G3: Notification Cron
- [ ] Match apartments to searches every 30 min
- [ ] Create notification queue
- [ ] Respect Telegram rate limits
- [ ] Track sent notifications

### TASK-G4: Apartment Display
- [ ] Format apartment card for Telegram
- [ ] Send photos as media group
- [ ] Include key details (price, rooms, area, link)
- [ ] Pagination for multiple results

### TASK-G5: Cleanup Jobs
- [ ] Remove old apartments (30+ days inactive)
- [ ] Clean up notification history
- [ ] Database maintenance

---

## PHASE H: Scraping Fallback

### TASK-H1: Scraper Setup
- [ ] Set up Puppeteer or Playwright
- [ ] Configure headless browser
- [ ] Implement request delays

### TASK-H2: DOM RIA Scraper
- [ ] Scrape apartment listing pages
- [ ] Parse apartment details
- [ ] Handle pagination
- [ ] Extract photos

### TASK-H3: Anti-Detection
- [ ] Rotate user agents
- [ ] Random delays between requests
- [ ] Handle CAPTCHAs (manual or service)

### TASK-H4: Proxy Management
- [ ] Choose proxy provider
- [ ] Implement proxy rotation
- [ ] Handle failed/banned proxies
- [ ] Monitor proxy health

---

## PHASE I: Deployment & DevOps

### TASK-I1: Docker Setup
- [ ] Dockerfile for bot/API
- [ ] Dockerfile for web app
- [ ] docker-compose.prod.yml
- [ ] Health checks

### TASK-I2: Server Setup
- [ ] Choose and provision server
- [ ] Configure firewall
- [ ] Set up SSL (Let's Encrypt)
- [ ] Configure domain

### TASK-I3: Deployment
- [ ] Set up CI/CD (GitHub Actions)
- [ ] Configure Telegram webhook
- [ ] Deploy bot + API
- [ ] Deploy Mini App

### TASK-I4: Monitoring & Logging
- [ ] Set up error tracking (Sentry)
- [ ] Configure structured logging
- [ ] Set up uptime monitoring
- [ ] Alerting (Telegram/email)

### TASK-I5: Database Backups
- [ ] Automated daily backups
- [ ] Backup to external storage (S3/Backblaze)
- [ ] Test restore procedure
- [ ] Backup notifications

---

## Current Progress

| Phase | Status | Description |
|-------|--------|-------------|
| A | COMPLETED | Project Setup |
| B | COMPLETED | Mini App UI |
| C | COMPLETED | Telegram Bot (C1-C3 done, C4 future) |
| D | COMPLETED | Database & API (D1-D5 done) |
| E | IN PROGRESS | Integration (E1-E2 core done, E3 remaining commands) |
| F | NOT STARTED | Apartment Fetching |
| G | NOT STARTED | Jobs & Notifications |
| H | NOT STARTED | Scraping |
| I | NOT STARTED | Deployment |
