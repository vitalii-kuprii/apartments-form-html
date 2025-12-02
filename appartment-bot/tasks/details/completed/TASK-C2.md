# TASK-C2: Bot Setup with grammY

## Description
Initialize grammY bot, implement basic commands (/start, /help), and set up development mode.

## Acceptance Criteria
- [ ] AC1: grammY bot initialized and responding
- [ ] AC2: /start command works and shows welcome message
- [ ] AC3: /help command shows available commands
- [ ] AC4: Bot running in polling mode for development
- [ ] AC5: Error handling configured

## Implementation

### Files to Create
```
bot/src/
├── bot/
│   ├── index.ts          # Bot initialization
│   ├── commands/
│   │   ├── start.ts      # /start handler
│   │   └── help.ts       # /help handler
│   └── middleware/
│       └── logger.ts     # Logging middleware
```

### Bot Initialization (bot/index.ts)
- Create Bot instance with token from env
- Register commands
- Add error handling
- Start polling (dev) or webhook (prod)

### /start Command
- Welcome message in Ukrainian
- Brief description of bot features
- Button to open Mini App (search form)

### /help Command
- List all available commands
- Brief description of each
- Support contact info

## Testing
- Run `npm run dev` in bot/
- Send /start to bot in Telegram
- Verify response received

---
**Status**: Not Started
**Estimate**: 1 hour
