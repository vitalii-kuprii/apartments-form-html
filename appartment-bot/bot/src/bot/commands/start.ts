import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import * as metrics from '../../lib/metrics.js';

export async function startCommand(ctx: CommandContext<Context>) {
  const userName = ctx.from?.first_name || 'друже';

  // Check if this is a new user
  let isNewUser = false;
  let user = null;
  let dbSuccess = false;

  // Prepare user context for logging
  const userContext = {
    userId: ctx.from?.id,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    lastName: ctx.from?.last_name,
    languageCode: ctx.from?.language_code,
    isPremium: ctx.from?.is_premium || false,
    isBot: ctx.from?.is_bot,
  };

  // Save/update user in database
  if (ctx.from) {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { id: BigInt(ctx.from.id) },
      });

      isNewUser = !existingUser;

      user = await prisma.user.upsert({
        where: { id: BigInt(ctx.from.id) },
        update: {
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          languageCode: ctx.from.language_code,
          isPremium: ctx.from.is_premium || false,
        },
        create: {
          id: BigInt(ctx.from.id),
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          languageCode: ctx.from.language_code,
          isBot: ctx.from.is_bot,
          isPremium: ctx.from.is_premium || false,
        },
      });

      dbSuccess = true;

      // Log successful user save/update
      logger.bot.userStarted(userContext, isNewUser, true);

      // Track metrics
      metrics.userStarted.inc({
        is_new: String(isNewUser),
        language: ctx.from.language_code || 'unknown',
        is_premium: String(ctx.from.is_premium || false),
      });
      metrics.userDbOperations.inc({ operation: 'upsert', status: 'success' });

    } catch (error) {
      // Log database error with full context
      logger.bot.userDbError(userContext, error as Error);

      // Track error metrics
      metrics.userDbOperations.inc({ operation: 'upsert', status: 'error' });
      metrics.errors.inc({ type: 'db_error', component: 'bot' });
    }
  }

  // For new users, show mode selection
  if (isNewUser) {
    logger.bot.info('user.show_mode_selection', 'Showing mode selection to new user', {
      user: userContext,
    });

    const welcomeMessage = `
Привіт, ${userName}! 👋

Я допоможу тобі знайти квартиру для оренди або купівлі в Україні.

🔍 *Як це працює:*
1. Створи пошук з потрібними фільтрами
2. Отримуй сповіщення про нові квартири
3. Зберігай вподобані варіанти

*Обери зручний режим створення пошуку:*
`.trim();

    const keyboard = new InlineKeyboard()
      .text('📱 Міні-додаток', 'set_mode_ui')
      .row()
      .text('💬 Telegram-режим', 'set_mode_native');

    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    return;
  }

  // For existing users, show the main menu
  logger.bot.info('user.show_main_menu', 'Showing main menu to returning user', {
    user: userContext,
    preferredMode: user?.preferredMode || 'ui',
    dbSuccess,
  });

  const welcomeMessage = `
Привіт, ${userName}! 👋

Я допоможу тобі знайти квартиру для оренди або купівлі в Україні.

🔍 *Як це працює:*
1. Створи пошук з потрібними фільтрами
2. Отримуй сповіщення про нові квартири
3. Зберігай вподобані варіанти

📱 *Створити пошук можна:*
• Натисни кнопку нижче
• Відправ посилання з DOM RIA
• Використай команду /search

⚙️ Налаштування: /settings

Почнімо! 🏠
`.trim();

  // Show keyboard based on user's preferred mode
  const preferredMode = user?.preferredMode || 'ui';
  const webAppUrl = process.env.WEBAPP_URL || 'https://example.com';

  const keyboard = preferredMode === 'ui'
    ? new InlineKeyboard()
        .webApp('🔍 Створити пошук', webAppUrl)
        .row()
        .webApp('📋 Мої пошуки', `${webAppUrl}?page=searches`)
        .webApp('⭐ Обране', `${webAppUrl}?page=favorites`)
    : new InlineKeyboard()
        .text('🔍 Створити пошук', 'quick_search')
        .row()
        .text('📋 Мої пошуки', 'my_searches')
        .text('⭐ Обране', 'favorites');

  await ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// Handler for mode selection callbacks
export async function handleModeSelection(ctx: Context, mode: 'ui' | 'native') {
  const userId = ctx.from?.id;
  if (!userId) return;

  const userContext = {
    userId,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
  };

  try {
    await prisma.user.update({
      where: { id: BigInt(userId) },
      data: { preferredMode: mode },
    });

    // Log mode selection
    logger.bot.userModeSelected(userContext, mode);

    // Track metrics
    metrics.userModeSelected.inc({ mode });
    metrics.userDbOperations.inc({ operation: 'update', status: 'success' });

    await ctx.answerCallbackQuery({
      text: mode === 'ui' ? 'Обрано міні-додаток' : 'Обрано Telegram-режим',
    });

    // Show main menu after selection
    const webAppUrl = process.env.WEBAPP_URL || 'https://example.com';

    const keyboard = mode === 'ui'
      ? new InlineKeyboard()
          .webApp('🔍 Створити пошук', webAppUrl)
          .row()
          .webApp('📋 Мої пошуки', `${webAppUrl}?page=searches`)
          .webApp('⭐ Обране', `${webAppUrl}?page=favorites`)
      : new InlineKeyboard()
          .text('🔍 Створити пошук', 'quick_search')
          .row()
          .text('📋 Мої пошуки', 'my_searches')
          .text('⭐ Обране', 'favorites');

    await ctx.editMessageText(
      `Режим *${mode === 'ui' ? 'Міні-додаток' : 'Telegram'}* збережено!\n\nТепер створіть свій перший пошук:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  } catch (error) {
    logger.bot.error('user.mode_selection_error', 'Failed to save user mode', {
      user: userContext,
      mode,
      error: {
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
    });

    metrics.userDbOperations.inc({ operation: 'update', status: 'error' });
    metrics.errors.inc({ type: 'db_error', component: 'bot' });

    await ctx.answerCallbackQuery({
      text: 'Помилка збереження. Спробуйте ще раз.',
      show_alert: true,
    });
  }
}
