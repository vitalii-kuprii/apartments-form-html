// Notification Sender Job
// Sends matched apartments to users via Telegram

import { prisma } from '../lib/prisma.js';
import { bot } from '../bot/index.js';
import { InlineKeyboard, InputMediaPhoto } from 'grammy';
import { logger } from '../lib/logger.js';
import * as metrics from '../lib/metrics.js';

// Format price with spaces as thousand separator
function formatPrice(price: number): string {
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Ukrainian word forms for rooms
function getRoomWord(count: number): string {
  if (count === 1) return 'кімната';
  if (count >= 2 && count <= 4) return 'кімнати';
  return 'кімнат';
}

// Relative date in Ukrainian
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'сьогодні';
  if (diffDays === 1) return 'вчора';
  if (diffDays < 7) {
    // Ukrainian plural forms for days
    if (diffDays >= 2 && diffDays <= 4) return `${diffDays} дні тому`;
    return `${diffDays} днів тому`;
  }
  return date.toLocaleDateString('uk-UA');
}

// Format apartment message for Telegram (wider horizontal layout)
function formatApartmentMessage(apartment: {
  title: string;
  city: string;
  district: string | null;
  address: string | null;
  price: number;
  currency: string;
  rooms: number | null;
  area: number | null;
  floor: number | null;
  totalFloors: number | null;
  isFromRealtor: boolean;
  agencyName: string | null;
  commission: string | null;
  petsFriendly: boolean;
  publishedAt: Date | null;
  url: string;
}): string {
  const lines: string[] = [];

  // Title with emoji
  lines.push(`🏠 *${apartment.title}*`);
  lines.push('');

  // Location - city, district, and address on one line
  let location = `📍 ${apartment.city}`;
  if (apartment.district) location += `, ${apartment.district}`;
  if (apartment.address) location += `, ${apartment.address}`;
  lines.push(location);
  lines.push('');

  // Compact details row: price | area | rooms | floor
  const detailParts: string[] = [];
  if (apartment.price > 0) {
    detailParts.push(`💰 ${formatPrice(apartment.price)} ${apartment.currency}`);
  }
  if (apartment.area) {
    detailParts.push(`📐 ${apartment.area} м²`);
  }
  if (apartment.rooms) {
    detailParts.push(`🚪 ${apartment.rooms} ${getRoomWord(apartment.rooms)}`);
  }
  if (apartment.floor) {
    if (apartment.totalFloors) {
      detailParts.push(`🏢 ${apartment.floor} з ${apartment.totalFloors}`);
    } else {
      detailParts.push(`🏢 ${apartment.floor} пов.`);
    }
  }
  if (detailParts.length > 0) {
    lines.push(detailParts.join('  ·  '));
    lines.push('');
  }

  // Owner/Realtor with agency name
  if (apartment.isFromRealtor) {
    let realtorLine = '👔 Рієлтор';
    if (apartment.agencyName) {
      realtorLine += ` (${apartment.agencyName})`;
    }
    lines.push(realtorLine);

    // Commission info
    if (apartment.commission) {
      lines.push(`💵 Комісія: ${apartment.commission}`);
    }
  } else {
    lines.push('👤 Власник');
  }

  // Pets friendly
  if (apartment.petsFriendly) {
    lines.push('🐾 Можна з тваринами');
  }

  return lines.join('\n');
}

// Build keyboard with photo navigation if multiple photos
function buildApartmentKeyboard(
  apartmentId: string,
  apartmentUrl: string,
  photoIndex: number,
  totalPhotos: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Add photo navigation row if multiple photos
  if (totalPhotos > 1) {
    // Previous button (wraps to last photo if at start)
    const prevIndex = photoIndex > 0 ? photoIndex - 1 : totalPhotos - 1;
    keyboard.text('◀️', `photo_${apartmentId}_${prevIndex}`);

    // Photo counter
    keyboard.text(`${photoIndex + 1}/${totalPhotos}`, 'noop');

    // Next button (wraps to first photo if at end)
    const nextIndex = photoIndex < totalPhotos - 1 ? photoIndex + 1 : 0;
    keyboard.text('▶️', `photo_${apartmentId}_${nextIndex}`);

    keyboard.row();
  }

  // Action buttons
  keyboard
    .url('🔗 Переглянути', apartmentUrl)
    .text('❤️', `fav_${apartmentId}`);

  return keyboard;
}

// Send notification to a user about a new apartment
async function sendApartmentNotification(
  userId: bigint,
  apartment: {
    id: string;
    title: string;
    city: string;
    district: string | null;
    address: string | null;
    price: number;
    currency: string;
    rooms: number | null;
    area: number | null;
    floor: number | null;
    totalFloors: number | null;
    isFromRealtor: boolean;
    agencyName: string | null;
    commission: string | null;
    petsFriendly: boolean;
    publishedAt: Date | null;
    url: string;
    photos: string[];
  },
  searchId: string
): Promise<boolean> {
  try {
    const message = formatApartmentMessage(apartment);
    const photos = apartment.photos.slice(0, 10); // Max 10 photos for carousel

    // Build keyboard with navigation if multiple photos
    const keyboard = buildApartmentKeyboard(apartment.id, apartment.url, 0, photos.length);

    let sentMessage;

    if (photos[0]) {
      // Send first photo with caption and navigation
      try {
        sentMessage = await bot.api.sendPhoto(userId.toString(), photos[0], {
          caption: message,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } catch (photoError) {
        // If photo fails, send text only
        logger.notifier.warn('notification.photo_failed', `Photo failed, sending text only`, {
          user: { userId: userId.toString() },
          apartment: {
            apartmentId: apartment.id,
            photoUrl: photos[0],
          },
          error: {
            error: (photoError as Error).message,
          },
        });
        metrics.notificationPhotoFallbacks.inc({ city: apartment.city });

        const textKeyboard = buildApartmentKeyboard(apartment.id, apartment.url, 0, 0);
        sentMessage = await bot.api.sendMessage(userId.toString(), message, {
          parse_mode: 'Markdown',
          reply_markup: textKeyboard,
          link_preview_options: { is_disabled: true },
        });
      }
    } else {
      // No photos - text only
      sentMessage = await bot.api.sendMessage(userId.toString(), message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    }

    // Record notification
    await prisma.notification.create({
      data: {
        userId,
        apartmentId: apartment.id,
        messageId: sentMessage.message_id,
        status: 'sent',
      },
    });

    // Record sent apartment for this search (skip for test notifications)
    if (searchId && searchId !== 'test-search') {
      await prisma.sentApartment.create({
        data: {
          searchId,
          apartmentId: apartment.id,
        },
      });
    }

    return true;
  } catch (error) {
    logger.notifier.notificationFailed(
      { userId: userId.toString() },
      {
        apartmentId: apartment.id,
        price: apartment.price,
        city: apartment.city,
      },
      error as Error
    );
    metrics.notificationsSent.inc({ status: 'failed', city: apartment.city });
    metrics.errors.inc({ type: 'notification_error', component: 'notifier' });

    // Record failed notification
    try {
      await prisma.notification.create({
        data: {
          userId,
          apartmentId: apartment.id,
          status: 'failed',
        },
      });
    } catch {
      // Ignore
    }

    return false;
  }
}

// Main notification sending function
export async function sendNotifications(
  matchedApartments: Map<string, string[]> // apartmentId -> searchIds
): Promise<{ sent: number; failed: number }> {
  const startTime = Date.now();

  logger.notifier.notificationBatchStarted(matchedApartments.size);

  let sent = 0;
  let failed = 0;

  for (const [apartmentId, searchIds] of matchedApartments) {
    // Get apartment details
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
      logger.notifier.warn('notification.apartment_not_found', `Apartment not found`, {
        apartment: { apartmentId },
      });
      continue;
    }

    // Get unique users from matched searches
    const searches = await prisma.search.findMany({
      where: {
        id: { in: searchIds },
        notifyEnabled: true,
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        user: {
          select: {
            notificationsEnabled: true,
          },
        },
      },
    });

    // Group by user (avoid duplicate notifications to same user)
    // Also skip apartments published before the search was created (prevents first-run spam)
    const userSearches = new Map<bigint, string[]>();
    for (const search of searches) {
      if (!search.user.notificationsEnabled) continue;

      // Skip historical apartments: only notify about apartments published AFTER the search was created
      if (apartment.publishedAt && apartment.publishedAt <= search.createdAt) {
        continue;
      }

      const existing = userSearches.get(search.userId) || [];
      existing.push(search.id);
      userSearches.set(search.userId, existing);
    }

    // Send to each user
    for (const [userId, userSearchIds] of userSearches) {
      // Use first search ID for tracking
      const firstSearchId = userSearchIds[0];
      if (!firstSearchId) continue;

      const success = await sendApartmentNotification(userId, apartment, firstSearchId);
      if (success) {
        sent++;

        // Log successful notification
        logger.notifier.notificationSent(
          { userId: userId.toString() },
          {
            apartmentId: apartment.id,
            price: apartment.price,
            city: apartment.city,
          },
          { searchIds: userSearchIds }
        );
        metrics.notificationsSent.inc({ status: 'success', city: apartment.city });

        // Mark as sent for all user's matching searches
        for (const searchId of userSearchIds.slice(1)) {
          try {
            await prisma.sentApartment.create({
              data: {
                searchId,
                apartmentId: apartment.id,
              },
            });
          } catch {
            // Ignore duplicate errors
          }
        }
      } else {
        failed++;
      }

      // Delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const duration = Date.now() - startTime;
  logger.notifier.notificationBatchCompleted(sent, failed, duration);
  metrics.notificationDuration.observe(duration / 1000);

  return { sent, failed };
}

// Export for use in scheduler and bot handlers
export { sendApartmentNotification, formatApartmentMessage, buildApartmentKeyboard };
