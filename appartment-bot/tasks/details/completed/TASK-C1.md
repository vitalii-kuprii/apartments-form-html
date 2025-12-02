# TASK-C1: Create Telegram Bot

## Description
Create a new Telegram bot via BotFather and configure its basic settings.

## Acceptance Criteria
- [ ] AC1: Bot created via @BotFather
- [ ] AC2: Bot token saved to .env file
- [ ] AC3: Bot name and description set
- [ ] AC4: Bot commands configured in BotFather

## Steps

### 1. Create Bot via BotFather
1. Open Telegram and search for @BotFather
2. Send `/newbot`
3. Choose a name (e.g., "Apartment Search Ukraine")
4. Choose a username (must end with `bot`, e.g., `ua_apartment_bot`)
5. Copy the bot token

### 2. Configure Bot in BotFather
Send these commands to @BotFather:

```
/setdescription
Select your bot, then send:
"Find apartments for rent or purchase in Ukraine. Set up search criteria and receive notifications about new listings."

/setabouttext
Select your bot, then send:
"Apartment search bot for Ukraine. Powered by DOM RIA."

/setcommands
Select your bot, then send:
start - Start the bot
search - Create new search
searches - View my searches
favorites - View saved apartments
help - Get help
settings - Bot settings
```

### 3. Save Token
Add bot token to `bot/.env`:
```
TELEGRAM_BOT_TOKEN=your_token_here
```

---
**Status**: Not Started
**Estimate**: 15 minutes
