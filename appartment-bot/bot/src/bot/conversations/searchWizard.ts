import { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import { Context, InlineKeyboard } from 'grammy';
import {
  SearchFormData,
  UKRAINIAN_CITIES,
  ROOM_OPTIONS,
  PRICE_PRESETS_RENT,
  PRICE_PRESETS_BUY,
  getDefaultSearchData,
} from '../../types/search.js';
import { prisma } from '../../lib/prisma.js';
import { PropertyType, ApartmentType } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import * as metrics from '../../lib/metrics.js';

export type SearchContext = Context & ConversationFlavor;
export type SearchConversation = Conversation<SearchContext>;

const CITIES_PER_PAGE = 8;

function getCityKeyboard(page: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const start = page * CITIES_PER_PAGE;
  const end = Math.min(start + CITIES_PER_PAGE, UKRAINIAN_CITIES.length);
  const cities = UKRAINIAN_CITIES.slice(start, end);

  // Add cities in 2 columns
  for (let i = 0; i < cities.length; i += 2) {
    if (i + 1 < cities.length) {
      keyboard
        .text(cities[i], `city:${cities[i]}`)
        .text(cities[i + 1], `city:${cities[i + 1]}`)
        .row();
    } else {
      keyboard.text(cities[i], `city:${cities[i]}`).row();
    }
  }

  // Navigation buttons
  const navRow: [string, string][] = [];
  if (page > 0) {
    navRow.push(['« Назад', `city_page:${page - 1}`]);
  }
  if (end < UKRAINIAN_CITIES.length) {
    navRow.push(['Далі »', `city_page:${page + 1}`]);
  }
  if (navRow.length > 0) {
    navRow.forEach(([text, data]) => keyboard.text(text, data));
    keyboard.row();
  }

  keyboard.text('❌ Скасувати', 'cancel');

  return keyboard;
}

function getPropertyTypeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🏠 Оренда', 'property:rent')
    .text('💰 Купівля', 'property:buy')
    .row()
    .text('« Назад', 'back:city')
    .text('❌ Скасувати', 'cancel');
}

function getApartmentTypeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🏢 Квартира', 'apartment:flat')
    .text('🏡 Будинок', 'apartment:house')
    .row()
    .text('« Назад', 'back:property')
    .text('❌ Скасувати', 'cancel');
}

function getPriceKeyboard(isRent: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const presets = isRent ? PRICE_PRESETS_RENT : PRICE_PRESETS_BUY;

  presets.forEach((preset, index) => {
    keyboard.text(preset.label, `price:${index}`).row();
  });

  keyboard
    .text('💬 Вказати свій діапазон', 'price:custom')
    .row()
    .text('⏭ Пропустити', 'price:skip')
    .row()
    .text('« Назад', 'back:apartment')
    .text('❌ Скасувати', 'cancel');

  return keyboard;
}

function getRoomsKeyboard(selectedRooms: number[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  ROOM_OPTIONS.forEach((room) => {
    const isSelected = selectedRooms.includes(room);
    const label = room === 4 ? '4+' : String(room);
    const text = isSelected ? `✅ ${label}` : label;
    keyboard.text(text, `room:${room}`);
  });

  keyboard
    .row()
    .text('✅ Готово', 'rooms:done')
    .row()
    .text('« Назад', 'back:price')
    .text('❌ Скасувати', 'cancel');

  return keyboard;
}

function getOptionsKeyboard(data: SearchFormData): InlineKeyboard {
  const realtorText = data.without_realtors ? '✅ Без рієлторів' : '☐ Без рієлторів';
  const petsText = data.pets_friendly ? '✅ Можна з тваринами 🐾' : '☐ Можна з тваринами 🐾';

  return new InlineKeyboard()
    .text(realtorText, 'option:realtors')
    .row()
    .text(petsText, 'option:pets')
    .row()
    .text('✅ Готово', 'options:done')
    .row()
    .text('« Назад', 'back:rooms')
    .text('❌ Скасувати', 'cancel');
}

function getConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Зберегти пошук', 'confirm:save')
    .row()
    .text('« Редагувати', 'back:options')
    .text('❌ Скасувати', 'cancel');
}

function formatSearchSummary(data: SearchFormData): string {
  const propertyType = data.property_type === 'rent' ? 'Оренда' : 'Купівля';
  const apartmentType = data.apartment_type === 'flat' ? 'Квартира' : 'Будинок';
  const rooms = data.rooms.length > 0
    ? data.rooms.map(r => r === 4 ? '4+' : r).join(', ') + ' кімн.'
    : 'Будь-яка кількість';

  let price = '';
  if (data.price_min > 0 || data.price_max) {
    const currency = data.property_type === 'rent' ? '₴' : '$';
    if (data.price_min > 0 && data.price_max) {
      price = `${data.price_min.toLocaleString()} - ${data.price_max.toLocaleString()} ${currency}`;
    } else if (data.price_min > 0) {
      price = `від ${data.price_min.toLocaleString()} ${currency}`;
    } else if (data.price_max) {
      price = `до ${data.price_max.toLocaleString()} ${currency}`;
    }
  } else {
    price = 'Будь-яка';
  }

  const options: string[] = [];
  if (data.without_realtors) options.push('Без рієлторів');
  if (data.pets_friendly) options.push('Можна з тваринами');

  return `📋 *Ваш пошук:*

🏙 *Місто:* ${data.city}
🏠 *Тип:* ${propertyType}
🏢 *Нерухомість:* ${apartmentType}
💰 *Ціна:* ${price}
🚪 *Кімнати:* ${rooms}
${options.length > 0 ? `⚙️ *Опції:* ${options.join(', ')}` : ''}

Зберегти цей пошук?`;
}

export async function searchWizard(
  conversation: SearchConversation,
  ctx: SearchContext
): Promise<void> {
  const data = getDefaultSearchData();
  let currentStep = 'city';
  let cityPage = 0;

  const userContext = {
    userId: ctx.from?.id,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
  };

  logger.bot.info('wizard.started', 'Search wizard started', {
    user: userContext,
  });

  // Step 1: City selection
  await ctx.reply('🏙 *Оберіть місто:*', {
    parse_mode: 'Markdown',
    reply_markup: getCityKeyboard(cityPage),
  });

  while (true) {
    const response = await conversation.waitForCallbackQuery(/^(city:|city_page:|property:|apartment:|price:|room:|rooms:|option:|options:|confirm:|back:|cancel)/, {
      otherwise: async (ctx) => {
        await ctx.reply('Будь ласка, використовуйте кнопки для вибору.');
      },
    });

    const callbackData = response.callbackQuery.data;
    await response.answerCallbackQuery();

    // Handle cancel
    if (callbackData === 'cancel') {
      logger.bot.info('wizard.cancelled', 'Search wizard cancelled', {
        user: userContext,
        search: {
          currentStep,
          city: data.city || 'not_selected',
        },
      });
      await response.editMessageText('❌ Пошук скасовано.', { reply_markup: undefined });
      return;
    }

    // Handle city page navigation
    if (callbackData.startsWith('city_page:')) {
      cityPage = parseInt(callbackData.split(':')[1]);
      await response.editMessageReplyMarkup({ reply_markup: getCityKeyboard(cityPage) });
      continue;
    }

    // Handle city selection
    if (callbackData.startsWith('city:')) {
      data.city = callbackData.split(':')[1];
      currentStep = 'property';
      await response.editMessageText(
        `🏙 Місто: *${data.city}*\n\n🏠 *Оберіть тип оголошення:*`,
        { parse_mode: 'Markdown', reply_markup: getPropertyTypeKeyboard() }
      );
      continue;
    }

    // Handle property type selection
    if (callbackData.startsWith('property:')) {
      data.property_type = callbackData.split(':')[1] as 'rent' | 'buy';
      currentStep = 'apartment';
      const typeText = data.property_type === 'rent' ? 'Оренда' : 'Купівля';
      await response.editMessageText(
        `🏙 Місто: *${data.city}*\n🏠 Тип: *${typeText}*\n\n🏢 *Оберіть тип нерухомості:*`,
        { parse_mode: 'Markdown', reply_markup: getApartmentTypeKeyboard() }
      );
      continue;
    }

    // Handle apartment type selection
    if (callbackData.startsWith('apartment:')) {
      data.apartment_type = callbackData.split(':')[1] as 'flat' | 'house';
      currentStep = 'price';
      const typeText = data.property_type === 'rent' ? 'Оренда' : 'Купівля';
      const apartmentText = data.apartment_type === 'flat' ? 'Квартира' : 'Будинок';
      await response.editMessageText(
        `🏙 Місто: *${data.city}*\n🏠 Тип: *${typeText}*\n🏢 Нерухомість: *${apartmentText}*\n\n💰 *Оберіть діапазон ціни:*`,
        { parse_mode: 'Markdown', reply_markup: getPriceKeyboard(data.property_type === 'rent') }
      );
      continue;
    }

    // Handle price selection
    if (callbackData.startsWith('price:')) {
      const priceValue = callbackData.split(':')[1];

      if (priceValue === 'skip') {
        data.price_min = 0;
        data.price_max = null;
      } else if (priceValue === 'custom') {
        await response.editMessageText(
          '💬 *Введіть мінімальну ціну* (або 0 щоб пропустити):',
          { parse_mode: 'Markdown', reply_markup: undefined }
        );

        const minPriceResponse = await conversation.waitFor('message:text');
        const minPrice = parseInt(minPriceResponse.message.text) || 0;
        data.price_min = minPrice;

        await minPriceResponse.reply(
          '💬 *Введіть максимальну ціну* (або 0 для необмеженої):',
          { parse_mode: 'Markdown' }
        );

        const maxPriceResponse = await conversation.waitFor('message:text');
        const maxPrice = parseInt(maxPriceResponse.message.text) || null;
        data.price_max = maxPrice === 0 ? null : maxPrice;

        currentStep = 'rooms';
        await maxPriceResponse.reply(
          `💰 Ціна: *${data.price_min > 0 ? `від ${data.price_min}` : ''} ${data.price_max ? `до ${data.price_max}` : ''}*\n\n🚪 *Оберіть кількість кімнат:*\n_(можна обрати декілька)_`,
          { parse_mode: 'Markdown', reply_markup: getRoomsKeyboard(data.rooms) }
        );
        continue;
      } else {
        const presets = data.property_type === 'rent' ? PRICE_PRESETS_RENT : PRICE_PRESETS_BUY;
        const preset = presets[parseInt(priceValue)];
        data.price_min = preset.min;
        data.price_max = preset.max;
      }

      if (priceValue !== 'custom') {
        currentStep = 'rooms';
        await response.editMessageText(
          `🚪 *Оберіть кількість кімнат:*\n_(можна обрати декілька)_`,
          { parse_mode: 'Markdown', reply_markup: getRoomsKeyboard(data.rooms) }
        );
      }
      continue;
    }

    // Handle room toggle
    if (callbackData.startsWith('room:')) {
      const room = parseInt(callbackData.split(':')[1]);
      const index = data.rooms.indexOf(room);
      if (index > -1) {
        data.rooms.splice(index, 1);
      } else {
        data.rooms.push(room);
        data.rooms.sort((a, b) => a - b);
      }
      await response.editMessageReplyMarkup({ reply_markup: getRoomsKeyboard(data.rooms) });
      continue;
    }

    // Handle rooms done
    if (callbackData === 'rooms:done') {
      currentStep = 'options';
      await response.editMessageText(
        `⚙️ *Додаткові опції:*`,
        { parse_mode: 'Markdown', reply_markup: getOptionsKeyboard(data) }
      );
      continue;
    }

    // Handle options toggle
    if (callbackData.startsWith('option:')) {
      const option = callbackData.split(':')[1];
      if (option === 'realtors') {
        data.without_realtors = !data.without_realtors;
      } else if (option === 'pets') {
        data.pets_friendly = !data.pets_friendly;
      }
      await response.editMessageReplyMarkup({ reply_markup: getOptionsKeyboard(data) });
      continue;
    }

    // Handle options done
    if (callbackData === 'options:done') {
      currentStep = 'confirm';
      await response.editMessageText(
        formatSearchSummary(data),
        { parse_mode: 'Markdown', reply_markup: getConfirmKeyboard() }
      );
      continue;
    }

    // Handle confirm save
    if (callbackData === 'confirm:save') {
      const userId = response.from?.id;

      if (!userId) {
        logger.bot.warn('wizard.no_user_id', 'Cannot save search - user ID not found', {
          user: userContext,
        });
        await response.editMessageText(
          '❌ *Помилка:* Не вдалося визначити користувача.',
          { parse_mode: 'Markdown', reply_markup: undefined }
        );
        return;
      }

      try {
        // Save search to database
        const search = await prisma.search.create({
          data: {
            userId: BigInt(userId),
            city: data.city,
            propertyType: data.property_type as PropertyType,
            apartmentType: data.apartment_type as ApartmentType,
            priceMin: data.price_min > 0 ? data.price_min : null,
            priceMax: data.price_max,
            rooms: data.rooms,
            areaMin: data.area_min > 0 ? data.area_min : null,
            areaMax: data.area_max,
            floorMin: data.floor_min > 0 ? data.floor_min : null,
            floorMax: data.floor_max,
            withoutRealtors: data.without_realtors,
            petsFriendly: data.pets_friendly,
          },
        });

        // Log successful search creation
        logger.bot.searchCreated(
          { id: userId, username: userContext.username, firstName: userContext.firstName },
          {
            searchId: search.id,
            city: data.city,
            propertyType: data.property_type,
            apartmentType: data.apartment_type,
            priceMin: data.price_min,
            priceMax: data.price_max,
            rooms: data.rooms,
            withoutRealtors: data.without_realtors,
            petsFriendly: data.pets_friendly,
          }
        );
        metrics.searchesCreated.inc({
          city: data.city,
          property_type: data.property_type,
          apartment_type: data.apartment_type,
        });

        await response.editMessageText(
          `✅ *Пошук збережено!*\n\nВи будете отримувати сповіщення про нові оголошення за цими критеріями.\n\n${formatSearchSummary(data)}`,
          { parse_mode: 'Markdown', reply_markup: undefined }
        );
      } catch (error) {
        logger.bot.error('wizard.save_failed', 'Failed to save search', {
          user: userContext,
          search: {
            city: data.city,
            propertyType: data.property_type,
            apartmentType: data.apartment_type,
            priceMin: data.price_min,
            priceMax: data.price_max,
            rooms: data.rooms,
          },
          error: {
            message: (error as Error).message,
            stack: (error as Error).stack,
          },
        });
        metrics.errors.inc({ type: 'search_save_error', component: 'wizard' });

        await response.editMessageText(
          `❌ *Помилка збереження пошуку.*\n\nСпробуйте ще раз пізніше.`,
          { parse_mode: 'Markdown', reply_markup: undefined }
        );
      }
      return;
    }

    // Handle back navigation
    if (callbackData.startsWith('back:')) {
      const target = callbackData.split(':')[1];

      switch (target) {
        case 'city':
          currentStep = 'city';
          await response.editMessageText('🏙 *Оберіть місто:*', {
            parse_mode: 'Markdown',
            reply_markup: getCityKeyboard(cityPage),
          });
          break;
        case 'property':
          currentStep = 'property';
          await response.editMessageText(
            `🏙 Місто: *${data.city}*\n\n🏠 *Оберіть тип оголошення:*`,
            { parse_mode: 'Markdown', reply_markup: getPropertyTypeKeyboard() }
          );
          break;
        case 'apartment':
          currentStep = 'apartment';
          const typeText = data.property_type === 'rent' ? 'Оренда' : 'Купівля';
          await response.editMessageText(
            `🏙 Місто: *${data.city}*\n🏠 Тип: *${typeText}*\n\n🏢 *Оберіть тип нерухомості:*`,
            { parse_mode: 'Markdown', reply_markup: getApartmentTypeKeyboard() }
          );
          break;
        case 'price':
          currentStep = 'price';
          await response.editMessageText(
            `💰 *Оберіть діапазон ціни:*`,
            { parse_mode: 'Markdown', reply_markup: getPriceKeyboard(data.property_type === 'rent') }
          );
          break;
        case 'rooms':
          currentStep = 'rooms';
          await response.editMessageText(
            `🚪 *Оберіть кількість кімнат:*\n_(можна обрати декілька)_`,
            { parse_mode: 'Markdown', reply_markup: getRoomsKeyboard(data.rooms) }
          );
          break;
        case 'options':
          currentStep = 'options';
          await response.editMessageText(
            `⚙️ *Додаткові опції:*`,
            { parse_mode: 'Markdown', reply_markup: getOptionsKeyboard(data) }
          );
          break;
      }
      continue;
    }
  }
}
