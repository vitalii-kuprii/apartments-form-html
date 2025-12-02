import { Bot, Context, GrammyError, HttpError, session, InlineKeyboard, InputMediaPhoto } from 'grammy';
import { conversations, createConversation, ConversationFlavor } from '@grammyjs/conversations';
import { startCommand } from './commands/start.js';
import { helpCommand } from './commands/help.js';
import { settingsCommand, handleSettingsCallback } from './commands/settings.js';
import { searchWizard } from './conversations/searchWizard.js';
import { prisma } from '../lib/prisma.js';
import { triggerManualFetch, getApiStats, getQueueStats } from '../jobs/scheduler.js';
import { sendApartmentNotification, formatApartmentMessage, buildApartmentKeyboard } from '../jobs/notificationSender.js';

// Admin user IDs (add your Telegram user ID here)
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(id => BigInt(id.trim())) || [];

// Session data interface
interface SessionData {
  // Add session data properties here as needed
}

// Context type with session and conversation
type MyContext = Context & ConversationFlavor;

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables');
}

export const bot = new Bot<MyContext>(token);

// Install session middleware
bot.use(session({
  initial: (): SessionData => ({}),
}));

// Install conversations plugin
bot.use(conversations());

// Register conversations
bot.use(createConversation(searchWizard));

// Register commands
bot.command('start', startCommand);
bot.command('help', helpCommand);
bot.command('settings', settingsCommand);
bot.command('search', async (ctx) => {
  await ctx.conversation.enter('searchWizard');
});

// Admin command: Manual fetch trigger
bot.command('fetch', async (ctx) => {
  if (!ctx.from) return;

  // Check if user is admin
  const userId = BigInt(ctx.from.id);
  if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(userId)) {
    await ctx.reply('This command is for admins only.');
    return;
  }

  await ctx.reply('Starting manual fetch...');

  try {
    const result = await triggerManualFetch();

    if (!result) {
      await ctx.reply('Scheduler not initialized. Please try again later.');
      return;
    }

    const message = result.skipped
      ? `Fetch skipped: ${result.skipReason}`
      : `Fetch complete:\n- New apartments: ${result.newApartments}\n- Notifications sent: ${result.notificationsSent}\n- Failed: ${result.notificationsFailed}`;

    await ctx.reply(message);
  } catch (error) {
    console.error('Manual fetch error:', error);
    await ctx.reply('Error during fetch. Check logs.');
  }
});

// Admin command: API stats
bot.command('stats', async (ctx) => {
  if (!ctx.from) return;

  // Check if user is admin
  const userId = BigInt(ctx.from.id);
  if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(userId)) {
    await ctx.reply('This command is for admins only.');
    return;
  }

  try {
    const [queueStats, apiStats] = await Promise.all([
      getQueueStats(),
      getApiStats(),
    ]);

    const lines = [
      '*API Stats:*',
      `Total requests: ${apiStats.totalRequests}`,
      `Daily requests: ${apiStats.dailyRequests}`,
      `Search calls: ${apiStats.searchRequests}`,
      `Detail calls: ${apiStats.detailRequests}`,
      '',
    ];

    if (queueStats) {
      lines.push(
        '*Queue Stats:*',
        `Kyiv hour: ${queueStats.kyivHour}:00`,
        `Next fetch: ${queueStats.nextFetchIn}`,
        `Waiting: ${queueStats.waiting}`,
        `Active: ${queueStats.active}`,
        `Completed: ${queueStats.completed}`,
        `Failed: ${queueStats.failed}`,
        `Delayed: ${queueStats.delayed}`,
      );
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Stats error:', error);
    await ctx.reply('Error getting stats. Check logs.');
  }
});

// Admin command: Test notification
bot.command('testnotify', async (ctx) => {
  if (!ctx.from) return;

  // Check if user is admin
  const userId = BigInt(ctx.from.id);
  if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(userId)) {
    await ctx.reply('This command is for admins only.');
    return;
  }

  await ctx.reply('Fetching real apartment from DB...');

  try {
    // Get a random apartment with photos from the database
    const apartment = await prisma.apartment.findFirst({
      where: {
        photos: { isEmpty: false },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        city: true,
        district: true,
        address: true,
        price: true,
        currency: true,
        rooms: true,
        area: true,
        floor: true,
        totalFloors: true,
        isFromRealtor: true,
        agencyName: true,
        commission: true,
        petsFriendly: true,
        publishedAt: true,
        url: true,
        photos: true,
      },
    });

    if (!apartment) {
      await ctx.reply('No apartments with photos found in DB.');
      return;
    }

    await ctx.reply(`Sending notification for: ${apartment.title}`);

    const success = await sendApartmentNotification(userId, apartment, 'test-search');
    if (success) {
      await ctx.reply('Test notification sent!');
    } else {
      await ctx.reply('Failed to send test notification.');
    }
  } catch (error) {
    console.error('Test notification error:', error);
    await ctx.reply('Error sending test notification. Check logs.');
  }
});

// Handle callback queries for buttons in /start
bot.callbackQuery('quick_search', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('searchWizard');
});

bot.callbackQuery('my_searches', async (ctx) => {
  await ctx.answerCallbackQuery();

  if (!ctx.from) {
    await ctx.reply('Помилка: не вдалося отримати дані користувача.');
    return;
  }

  try {
    // Check user's preferred mode
    const user = await prisma.user.findUnique({
      where: { id: BigInt(ctx.from.id) },
      select: { preferredMode: true },
    });

    // If UI mode, show button to open web app
    if (user?.preferredMode === 'ui') {
      const webAppUrl = process.env.WEBAPP_URL || 'https://example.com';
      const keyboard = new InlineKeyboard()
        .webApp('📋 Відкрити мої пошуки', `${webAppUrl}/searches`);

      await ctx.reply('Натисніть кнопку нижче, щоб переглянути ваші пошуки:', {
        reply_markup: keyboard,
      });
      return;
    }

    // Native mode - show searches in text format
    const searches = await prisma.search.findMany({
      where: { userId: BigInt(ctx.from.id) },
      orderBy: { createdAt: 'desc' },
    });

    if (searches.length === 0) {
      await ctx.reply('📋 Ваші збережені пошуки:\n\n_Поки що немає збережених пошуків_\n\nВикористайте /search або кнопку "Створити пошук" щоб додати новий.', {
        parse_mode: 'Markdown',
      });
      return;
    }

    const searchList = searches.map((s, i) => {
      const typeIcon = s.propertyType === 'rent' ? '🏠' : '🏡';
      const type = s.propertyType === 'rent' ? 'Оренда' : 'Купівля';
      const rooms = s.rooms.length > 0 ? s.rooms.join(', ') + ' кімн.' : 'будь-які';
      const priceFormatted = s.priceMax ? s.priceMax.toLocaleString('uk-UA') : null;
      const price = priceFormatted ? `💰 до ${priceFormatted} ₴` : '💰 без обмежень';
      const status = s.isActive ? '🟢' : '⏸️';
      return `${status} *${s.city}* ${typeIcon}\n├ ${type} • ${rooms}\n└ ${price}`;
    }).join('\n\n');

    await ctx.reply(`📋 *Ваші збережені пошуки (${searches.length}):*\n\n${searchList}`, {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('Error fetching searches:', error);
    await ctx.reply('Помилка при отриманні пошуків. Спробуйте пізніше.');
  }
});

bot.callbackQuery('favorites', async (ctx) => {
  await ctx.answerCallbackQuery();

  if (!ctx.from) {
    await ctx.reply('Помилка: не вдалося отримати дані користувача.');
    return;
  }

  try {
    // Check user's preferred mode
    const user = await prisma.user.findUnique({
      where: { id: BigInt(ctx.from.id) },
      select: { preferredMode: true },
    });

    // If UI mode, show button to open web app
    if (user?.preferredMode === 'ui') {
      const webAppUrl = process.env.WEBAPP_URL || 'https://example.com';
      const keyboard = new InlineKeyboard()
        .webApp('❤️ Відкрити обране', `${webAppUrl}/favorites`);

      await ctx.reply('Натисніть кнопку нижче, щоб переглянути обране:', {
        reply_markup: keyboard,
      });
      return;
    }

    // Native mode - show favorites in text format
    const favorites = await prisma.favorite.findMany({
      where: { userId: BigInt(ctx.from.id) },
      include: { apartment: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (favorites.length === 0) {
      await ctx.reply('❤️ Ваше обране:\n\n_Поки що немає збережених оголошень_\n\nДодайте оголошення до обраного, щоб вони з\'явились тут.', {
        parse_mode: 'Markdown',
      });
      return;
    }

    const favList = favorites.map((f, i) => {
      const a = f.apartment;
      const priceFormatted = a.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      return `${i + 1}. *${a.title}*\n   📍 ${a.city}${a.district ? `, ${a.district}` : ''}\n   💰 ${priceFormatted} ${a.currency}\n   🔗 [Переглянути](${a.url})`;
    }).join('\n\n');

    await ctx.reply(`❤️ *Ваше обране (${favorites.length}):*\n\n${favList}`, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    await ctx.reply('Помилка при отриманні обраного. Спробуйте пізніше.');
  }
});

// Handle adding apartment to favorites
bot.callbackQuery(/^fav_(.+)$/, async (ctx) => {
  const apartmentId = ctx.match?.[1];

  if (!apartmentId || !ctx.from) {
    await ctx.answerCallbackQuery({ text: 'Помилка' });
    return;
  }

  try {
    // Check if already favorited
    const existing = await prisma.favorite.findUnique({
      where: {
        userId_apartmentId: {
          userId: BigInt(ctx.from.id),
          apartmentId,
        },
      },
    });

    if (existing) {
      await ctx.answerCallbackQuery({ text: '❤️ Вже в обраному!' });
      return;
    }

    // Add to favorites
    await prisma.favorite.create({
      data: {
        userId: BigInt(ctx.from.id),
        apartmentId,
      },
    });

    await ctx.answerCallbackQuery({ text: '❤️ Додано в обране!' });
  } catch (error) {
    console.error('Error adding favorite:', error);
    await ctx.answerCallbackQuery({ text: 'Помилка при додаванні' });
  }
});

// Handle noop callback (for disabled buttons and counters)
bot.callbackQuery('noop', async (ctx) => {
  await ctx.answerCallbackQuery();
});

// Handle photo navigation
bot.callbackQuery(/^photo_(.+)_(\d+)$/, async (ctx) => {
  const apartmentId = ctx.match?.[1];
  const photoIndex = parseInt(ctx.match?.[2] || '0', 10);

  if (!apartmentId) {
    await ctx.answerCallbackQuery({ text: 'Помилка' });
    return;
  }

  try {
    // Get apartment from DB
    const apartment = await prisma.apartment.findUnique({
      where: { id: apartmentId },
      select: {
        id: true,
        title: true,
        city: true,
        district: true,
        address: true,
        price: true,
        currency: true,
        rooms: true,
        area: true,
        floor: true,
        totalFloors: true,
        isFromRealtor: true,
        agencyName: true,
        commission: true,
        petsFriendly: true,
        publishedAt: true,
        url: true,
        photos: true,
      },
    });

    if (!apartment) {
      await ctx.answerCallbackQuery({ text: 'Квартиру не знайдено' });
      return;
    }

    const photos = apartment.photos.slice(0, 10);
    const safeIndex = Math.max(0, Math.min(photoIndex, photos.length - 1));
    const photo = photos[safeIndex];

    if (!photo) {
      await ctx.answerCallbackQuery({ text: 'Фото не знайдено' });
      return;
    }

    // Build new keyboard with updated navigation
    const keyboard = buildApartmentKeyboard(apartment.id, apartment.url, safeIndex, photos.length);

    // Build caption
    const caption = formatApartmentMessage(apartment);

    // Edit the media with new photo
    await ctx.editMessageMedia(
      {
        type: 'photo',
        media: photo,
        caption,
        parse_mode: 'Markdown',
      },
      { reply_markup: keyboard }
    );

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error('Error navigating photos:', error);
    await ctx.answerCallbackQuery({ text: 'Помилка при завантаженні' });
  }
});

// Handle settings callbacks
bot.callbackQuery(/^settings_/, handleSettingsCallback);

// Handle mode selection from /start for new users
bot.callbackQuery(/^set_mode_(ui|native)$/, async (ctx) => {
  const mode = ctx.match?.[1];
  if (!mode || !ctx.from) {
    await ctx.answerCallbackQuery({ text: 'Помилка' });
    return;
  }

  try {
    // Update user's preferred mode
    await prisma.user.update({
      where: { id: BigInt(ctx.from.id) },
      data: { preferredMode: mode },
    });

    const modeText = mode === 'ui' ? '📱 Міні-додаток' : '💬 Telegram-режим';
    const modeDescription = mode === 'ui'
      ? 'Тепер ви можете створювати пошуки через зручний міні-додаток.'
      : 'Тепер ви можете створювати пошуки через діалог в чаті.';

    // Update the message with confirmation and main menu
    const confirmMessage = `
✅ Режим обрано: ${modeText}

${modeDescription}

📱 *Створити пошук можна:*
• Натисни кнопку нижче
• Відправ посилання з DOM RIA
• Використай команду /search

⚙️ Змінити режим: /settings

Почнімо! 🏠
`.trim();

    const webAppUrl = process.env.WEBAPP_URL || 'https://example.com';
    const keyboard = mode === 'ui'
      ? new InlineKeyboard()
          .webApp('🔍 Створити пошук', webAppUrl)
          .row()
          .webApp('📋 Мої пошуки', `${webAppUrl}?page=searches`)
          .webApp('❤️ Обране', `${webAppUrl}?page=favorites`)
      : new InlineKeyboard()
          .text('🔍 Створити пошук', 'quick_search')
          .row()
          .text('📋 Мої пошуки', 'my_searches')
          .text('❤️ Обране', 'favorites');

    await ctx.editMessageText(confirmMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });

    await ctx.answerCallbackQuery({ text: `Режим: ${modeText}` });
  } catch (error) {
    console.error('Error setting mode:', error);
    await ctx.answerCallbackQuery({ text: 'Помилка при збереженні' });
  }
});

// Error handling
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);

  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

export async function startBot() {
  console.log('Starting bot in polling mode...');
  await bot.start({
    onStart: (botInfo) => {
      console.log(`Bot @${botInfo.username} is running!`);
    },
  });
}
