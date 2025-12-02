# Future Features & Ideas

This document contains features, improvements, and infrastructure decisions to consider for future development.

---

## 1. INFRASTRUCTURE & DEVOPS

### 1.1 Database Backup Strategy
**Status**: TO DISCUSS

Options to consider:
- [ ] **Automated daily backups** to external storage
- [ ] **Backup destinations**: AWS S3, Backblaze B2, Google Cloud Storage
- [ ] **Retention policy**: Keep 7 daily, 4 weekly, 3 monthly backups
- [ ] **Point-in-time recovery**: PostgreSQL WAL archiving
- [ ] **Backup notifications**: Alert on success/failure via Telegram
- [ ] **Restore testing**: Monthly restore drill to verify backups work

**Tools to evaluate**:
- pg_dump + cron (simple)
- pgBackRest (advanced, incremental)
- Barman (enterprise-grade)
- Cloud-native (if using managed DB)

### 1.2 Server Infrastructure
**Status**: TO DECIDE

**Questions to resolve**:
- [ ] Single server vs multiple servers?
- [ ] VPS provider: DigitalOcean, Hetzner, Linode, Vultr?
- [ ] Region: Germany (closest to Ukraine), Netherlands?
- [ ] Server specs: Start with 4GB RAM, 2 CPU?
- [ ] Scaling strategy: Vertical first, then horizontal?

**Considerations**:
- All apps on one server initially (bot, API, Mini App, DB, Redis)
- Separate DB server when load increases
- CDN for Mini App static files (Cloudflare)

### 1.3 Error Logging & Monitoring
**Status**: TO IMPLEMENT

**Logging**:
- [ ] Structured JSON logging (pino for Fastify)
- [ ] Log levels: error, warn, info, debug
- [ ] Log aggregation service: Grafana Loki, Papertrail, or self-hosted
- [ ] Log retention: 30 days minimum

**Error Tracking**:
- [ ] Sentry for error tracking and alerting
- [ ] Source maps for TypeScript stack traces
- [ ] Error grouping and notifications

**Monitoring**:
- [ ] Uptime monitoring: UptimeRobot, Healthchecks.io
- [ ] Server metrics: Prometheus + Grafana or Netdata
- [ ] Custom metrics: apartments fetched, notifications sent, active users

**Alerting**:
- [ ] Telegram bot for critical alerts
- [ ] Email for daily summaries

---

## 2. ACCESS CONTROL & SUBSCRIPTIONS

### 2.1 Telegram Channel Subscription Gate
**Status**: TO IMPLEMENT

**How it works**:
1. User starts bot
2. Bot checks if user is subscribed to required Telegram channel
3. If not subscribed → show "Subscribe to use bot" message with link
4. If subscribed → allow access

**Implementation**:
```
Required subscriptions:
- [ ] Main Telegram channel (@your_channel)
- [ ] Optional: Instagram follow verification (harder to implement)
```

**Technical approach**:
- Use Telegram Bot API: `getChatMember(channel_id, user_id)`
- Check subscription status on /start and periodically
- Store subscription status in DB with last_checked timestamp

### 2.2 Instagram Subscription Check
**Status**: IDEA (Complex)

**Challenges**:
- No official API for checking followers
- Would need user to manually confirm or link Instagram account
- Could use OAuth but complex setup

**Possible approaches**:
- [ ] Manual verification: User sends screenshot
- [ ] Honor system: User clicks "I subscribed" button
- [ ] Instagram Basic Display API (limited functionality)

---

## 3. REFERRAL & PROMO SYSTEM

### 3.1 Referral Program
**Status**: TO DESIGN

**Concept**: Users invite friends → unlock premium features

**Mechanics**:
```
- Each user gets unique referral link/code
- When friend signs up via link → both get rewards
- Rewards unlock based on referral count
```

**Reward tiers**:
| Referrals | Reward |
|-----------|--------|
| 1 friend | +1 extra saved search (total 4) |
| 3 friends | Priority notifications (faster) |
| 5 friends | +2 extra saved searches (total 6) |
| 10 friends | All premium features for 1 month |

**Database additions**:
```sql
-- Add to users table
referred_by_id    -- who referred this user
referral_code     -- unique code for sharing

-- New table
referrals (
  id,
  referrer_id,    -- who shared the link
  referred_id,    -- new user
  reward_claimed, -- boolean
  created_at
)
```

### 3.2 Promo Codes
**Status**: IDEA

**Use cases**:
- Marketing campaigns
- Influencer partnerships
- Beta tester rewards
- Compensation for bugs/issues

**Features**:
- [ ] One-time use codes
- [ ] Multi-use codes with limit
- [ ] Expiration dates
- [ ] Different reward types (premium days, extra searches)

---

## 4. PREMIUM FEATURES (Monetization)

### 4.1 Free vs Premium
**Status**: TO DECIDE

| Feature | Free | Premium |
|---------|------|---------|
| Saved searches | 3 | 10 |
| Notification frequency | Every 2 hours | Every 30 min |
| Favorites | 20 | Unlimited |
| Price history | No | Yes |
| Instant alerts | No | Yes (real-time) |
| No ads | No | Yes |
| Priority support | No | Yes |

### 4.2 Payment Integration
**Status**: FUTURE

Options:
- [ ] Telegram Payments (Stars)
- [ ] Monobank / PrivatBank (Ukraine)
- [ ] Stripe (international)
- [ ] Crypto payments

---

## 5. ADDITIONAL DATA SOURCES

### 5.1 Other Apartment Platforms
**Status**: FUTURE

- [ ] OLX Ukraine (olx.ua)
- [ ] Flatfy (flatfy.ua)
- [ ] LUN (lun.ua)
- [ ] Local city-specific sites

### 5.2 Data Enrichment
**Status**: IDEA

- [ ] Google Maps integration (commute times)
- [ ] Neighborhood safety data
- [ ] School/kindergarten proximity
- [ ] Public transport accessibility

---

## 6. AI & SMART FEATURES

### 6.1 AI-Powered Matching
**Status**: FUTURE

- [ ] Learn user preferences from favorites/skips
- [ ] Smart apartment scoring
- [ ] "You might like" recommendations
- [ ] Duplicate detection across sources

### 6.2 Price Analysis
**Status**: FUTURE

- [ ] Price history charts
- [ ] "Good deal" detection (below market price)
- [ ] Price prediction
- [ ] Market trends by area

---

## 7. UI ENHANCEMENTS

### 7.1 Map View
**Status**: FUTURE

- [ ] Show apartments on map in Mini App
- [ ] Filter by drawing area on map
- [ ] Show nearby amenities

### 7.2 Apartment Comparison
**Status**: IDEA

- [ ] Compare 2-3 apartments side by side
- [ ] Highlight differences
- [ ] Share comparison with others

### 7.3 Multi-language Support
**Status**: FUTURE

- [ ] Ukrainian (default)
- [ ] Russian
- [ ] English

---

## 8. ADMIN & ANALYTICS

### 8.1 Admin Dashboard
**Status**: FUTURE

- [ ] User statistics
- [ ] Apartment fetch status
- [ ] Error logs viewer
- [ ] Manual user management
- [ ] System health overview

### 8.2 Analytics
**Status**: FUTURE

Track and analyze:
- [ ] Daily/weekly/monthly active users
- [ ] Search creation rate
- [ ] Notification open rate
- [ ] Most popular cities/filters
- [ ] Conversion funnel (start → search → notification → click)

---

## 9. USER ACTIVITY TRACKING

### 9.1 Problem
- Wasting API requests fetching apartments for inactive users
- Need to know how many active users we have

### 9.2 Solution: Activity-Based User Status

Track user activity and pause notifications for inactive users:

**Activity signals:**
- Bot interaction (any command/message)
- Mini App opened
- Notification clicked
- Search created/edited

**User statuses:**
| Status | Criteria | Notifications |
|--------|----------|---------------|
| Active | Activity in last 7 days | YES |
| Idle | No activity 7-30 days | YES (reduced) |
| Inactive | No activity 30+ days | NO (paused) |
| Churned | No activity 90+ days | NO (archived) |

**Implementation:**
- [ ] Add `last_active_at` field to users table
- [ ] Update on every user interaction
- [ ] Cron job to update user statuses daily
- [ ] Skip inactive users when sending notifications
- [ ] Send "We miss you" reactivation message before pausing
- [ ] Dashboard showing active/idle/inactive counts

**Benefits:**
- Save API requests (don't fetch for inactive users)
- Know real active user count
- Identify churn patterns
- Re-engagement opportunities

---

## 10. TECHNICAL IMPROVEMENTS

### 9.1 Performance
- [ ] Database query optimization
- [ ] Redis caching strategy
- [ ] CDN for Mini App
- [ ] Image optimization/proxying

### 9.2 Testing
- [ ] Unit tests for core logic
- [ ] Integration tests for API
- [ ] E2E tests for Mini App (Playwright)
- [ ] Load testing

### 9.3 Security
- [ ] Rate limiting per user
- [ ] Input validation
- [ ] SQL injection prevention (Prisma handles)
- [ ] XSS prevention in Mini App

---

## Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| TG Channel subscription | Medium | Low | HIGH |
| Error logging (Sentry) | High | Low | HIGH |
| DB backups | High | Medium | HIGH |
| Referral system | Medium | Medium | MEDIUM |
| Premium features | High | High | MEDIUM |
| Instagram check | Low | High | LOW |
| AI matching | High | High | LOW |
| Map view | Medium | High | LOW |

---

## Notes & Ideas

Add your random ideas and notes here:

-
-
-
