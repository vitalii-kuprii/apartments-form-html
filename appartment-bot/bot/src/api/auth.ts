import crypto from 'crypto';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

interface ValidationResult {
  valid: boolean;
  user?: TelegramUser;
  authDate?: number;
}

/**
 * Validates Telegram Mini App init data
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramWebAppData(initData: string): ValidationResult {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN is not set');
    return { valid: false };
  }

  try {
    // Parse the init data
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    if (!hash) {
      return { valid: false };
    }

    // Remove hash from params and sort
    urlParams.delete('hash');
    const params: string[] = [];
    urlParams.forEach((value, key) => {
      params.push(`${key}=${value}`);
    });
    params.sort();
    const dataCheckString = params.join('\n');

    // Create secret key
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { valid: false };
    }

    // Check auth_date (not older than 24 hours)
    const authDate = parseInt(urlParams.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 hours

    if (now - authDate > maxAge) {
      return { valid: false };
    }

    // Parse user data
    const userStr = urlParams.get('user');
    if (!userStr) {
      return { valid: false };
    }

    const user: TelegramUser = JSON.parse(decodeURIComponent(userStr));

    return {
      valid: true,
      user,
      authDate,
    };
  } catch (error) {
    console.error('Error validating Telegram init data:', error);
    return { valid: false };
  }
}

/**
 * For development/testing - creates mock init data
 */
export function createMockInitData(user: TelegramUser): string {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  const authDate = Math.floor(Date.now() / 1000);
  const userStr = encodeURIComponent(JSON.stringify(user));

  const params = [
    `auth_date=${authDate}`,
    `user=${userStr}`,
  ];
  params.sort();
  const dataCheckString = params.join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return `${params.join('&')}&hash=${hash}`;
}
