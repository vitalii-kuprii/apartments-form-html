import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { prisma } from '../../lib/prisma.js';

// Get settings keyboard based on current user settings
function getSettingsKeyboard(mode: string, notificationsEnabled: boolean): InlineKeyboard {
  const modeEmoji = mode === 'ui' ? '📱' : '💬';
  const modeText = mode === 'ui' ? 'Міні-додаток' : 'Telegram-режим';
  const notifyEmoji = notificationsEnabled ? '🔔' : '🔕';
  const notifyText = notificationsEnabled ? 'Увімкнено' : 'Вимкнено';

  return new InlineKeyboard()
    .text(`Режим: ${modeEmoji} ${modeText}`, 'settings_toggle_mode')
    .row()
    .text(`Сповіщення: ${notifyEmoji} ${notifyText}`, 'settings_toggle_notify')
    .row()
    .text('⬅️ Назад', 'settings_back');
}

// Format settings message
function getSettingsMessage(mode: string, notificationsEnabled: boolean): string {
  const modeDescription = mode === 'ui'
    ? '📱 *Міні-додаток* - створення пошуку через веб-інтерфейс'
    : '💬 *Telegram-режим* - створення пошуку через діалог в чаті';

  const notifyDescription = notificationsEnabled
    ? '🔔 *Увімкнено* - ви отримуєте сповіщення про нові квартири'
    : '🔕 *Вимкнено* - сповіщення не надходять';

  return `
⚙️ *Налаштування*

*Режим пошуку:*
${modeDescription}

*Сповіщення:*
${notifyDescription}

Натисніть на кнопку, щоб змінити налаштування.
`.trim();
}

export async function settingsCommand(ctx: CommandContext<Context>) {
  if (!ctx.from) {
    await ctx.reply('Не вдалося визначити користувача.');
    return;
  }

  const userId = BigInt(ctx.from.id);

  // Get or create user
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      preferredMode: true,
      notificationsEnabled: true,
    },
  });

  if (!user) {
    // Create user if doesn't exist
    user = await prisma.user.create({
      data: {
        id: userId,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        languageCode: ctx.from.language_code,
        isBot: ctx.from.is_bot,
        isPremium: ctx.from.is_premium || false,
      },
      select: {
        preferredMode: true,
        notificationsEnabled: true,
      },
    });
  }

  const message = getSettingsMessage(user.preferredMode, user.notificationsEnabled);
  const keyboard = getSettingsKeyboard(user.preferredMode, user.notificationsEnabled);

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// Handle settings callback queries
export async function handleSettingsCallback(ctx: Context) {
  if (!ctx.callbackQuery?.data || !ctx.from) return;

  const action = ctx.callbackQuery.data;
  const userId = BigInt(ctx.from.id);

  // Get current user settings
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      preferredMode: true,
      notificationsEnabled: true,
    },
  });

  if (!user) {
    await ctx.answerCallbackQuery({ text: 'Користувача не знайдено' });
    return;
  }

  if (action === 'settings_toggle_mode') {
    // Toggle mode
    const newMode = user.preferredMode === 'ui' ? 'native' : 'ui';
    await prisma.user.update({
      where: { id: userId },
      data: { preferredMode: newMode },
    });

    const message = getSettingsMessage(newMode, user.notificationsEnabled);
    const keyboard = getSettingsKeyboard(newMode, user.notificationsEnabled);

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });

    const modeText = newMode === 'ui' ? 'Міні-додаток' : 'Telegram-режим';
    await ctx.answerCallbackQuery({ text: `Режим змінено на: ${modeText}` });

  } else if (action === 'settings_toggle_notify') {
    // Toggle notifications
    const newNotify = !user.notificationsEnabled;
    await prisma.user.update({
      where: { id: userId },
      data: { notificationsEnabled: newNotify },
    });

    const message = getSettingsMessage(user.preferredMode, newNotify);
    const keyboard = getSettingsKeyboard(user.preferredMode, newNotify);

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });

    const notifyText = newNotify ? 'Увімкнено' : 'Вимкнено';
    await ctx.answerCallbackQuery({ text: `Сповіщення: ${notifyText}` });

  } else if (action === 'settings_back') {
    // Go back - delete the settings message
    await ctx.deleteMessage();
    await ctx.answerCallbackQuery();
  }
}
