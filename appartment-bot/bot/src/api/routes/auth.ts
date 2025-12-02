import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { validateTelegramWebAppData } from '../auth.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Authenticate user from Mini App
  fastify.post('/auth', async (request, reply) => {
    const initData = request.headers['x-telegram-init-data'] as string;

    if (!initData) {
      return reply.status(400).send({ error: 'Missing init data' });
    }

    const validation = validateTelegramWebAppData(initData);

    if (!validation.valid || !validation.user) {
      return reply.status(401).send({ error: 'Invalid init data' });
    }

    const tgUser = validation.user;

    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { id: BigInt(tgUser.id) },
      update: {
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        languageCode: tgUser.language_code,
        isPremium: tgUser.is_premium || false,
      },
      create: {
        id: BigInt(tgUser.id),
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        languageCode: tgUser.language_code,
        isPremium: tgUser.is_premium || false,
      },
    });

    // Return user data (convert BigInt to string for JSON)
    return {
      id: user.id.toString(),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      notificationsEnabled: user.notificationsEnabled,
      createdAt: user.createdAt.toISOString(),
    };
  });

  // Get current user profile
  fastify.get('/user', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const tgUser = request.telegramUser;

    const user = await prisma.user.findUnique({
      where: { id: BigInt(tgUser.id) },
      include: {
        _count: {
          select: {
            searches: true,
            favorites: true,
          },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return {
      id: user.id.toString(),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      notificationsEnabled: user.notificationsEnabled,
      searchesCount: user._count.searches,
      favoritesCount: user._count.favorites,
      createdAt: user.createdAt.toISOString(),
    };
  });

  // Update user preferences
  fastify.put('/user', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, _reply) => {
    const tgUser = request.telegramUser;
    const { notificationsEnabled } = request.body as { notificationsEnabled?: boolean };

    const user = await prisma.user.update({
      where: { id: BigInt(tgUser.id) },
      data: {
        notificationsEnabled: notificationsEnabled ?? undefined,
      },
    });

    return {
      id: user.id.toString(),
      notificationsEnabled: user.notificationsEnabled,
    };
  });
}
