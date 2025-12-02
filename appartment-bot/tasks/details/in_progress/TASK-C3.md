# TASK-C3: Search Creation Methods (CRITICAL)

## Description
Implement 3 ways for users to create apartment searches.

## Acceptance Criteria
- [ ] AC1: Method 1 - Mini App button opens web app
- [ ] AC2: Method 2 - Paste DOM RIA URL, bot parses filters
- [ ] AC3: Method 3 - Telegram native UI wizard works
- [ ] AC4: All methods save search to database

---

## Method 1: Open Web App (Priority)

### Implementation
- Add "Create Search" button in /start message
- Button type: `web_app` with Mini App URL
- Handle data returned from Mini App via `web_app_data`

### Code Location
- `bot/src/bot/commands/start.ts` - add button
- `bot/src/bot/handlers/webapp.ts` - handle returned data

---

## Method 2: Paste DOM RIA Link

### How It Works
1. User pastes URL like: `https://dom.ria.com/uk/search/?category=1&realty_type=2&operation=3&city=1&price_min=5000`
2. Bot detects it's a DOM RIA URL
3. Bot parses query parameters
4. Bot shows parsed filters to user for confirmation
5. User confirms → save search

### URL Parameters to Parse
- `city` → city ID
- `price_min`, `price_max` → price range
- `rooms_count` → rooms
- `total_square_min`, `total_square_max` → area
- `realty_type` → property type
- `operation` → rent/buy

### Code Location
- `bot/src/bot/handlers/message.ts` - detect URL
- `bot/src/services/domria-parser.ts` - parse URL
- `bot/src/bot/handlers/search-confirm.ts` - confirmation flow

---

## Method 3: Telegram Native UI

### Flow
```
/search
   ↓
[Select City] - inline keyboard with cities
   ↓
[Rent / Buy] - two buttons
   ↓
[Price Range] - predefined ranges or "Any"
   ↓
[Rooms] - 1, 2, 3, 4+, Any
   ↓
[Confirm] - show summary, Save button
```

### Code Location
- `bot/src/bot/commands/search.ts` - start wizard
- `bot/src/bot/conversations/search-wizard.ts` - conversation flow
- Use grammY conversations plugin or callback queries

---

## Testing
1. Method 1: Click button → Mini App opens
2. Method 2: Paste `https://dom.ria.com/uk/search/?city=1&price_max=10000` → bot parses
3. Method 3: /search → complete wizard → search saved

---
**Status**: Not Started
**Estimate**: 3-4 hours
