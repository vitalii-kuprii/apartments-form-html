import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';

interface AddFavoriteBody {
  apartmentId: string;
}

export async function favoriteRoutes(fastify: FastifyInstance) {
  // Add apartment to favorites
  fastify.post('/favorites', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const tgUser = request.telegramUser;
    const { apartmentId } = request.body as AddFavoriteBody;

    if (!apartmentId) {
      return reply.status(400).send({ error: 'apartmentId is required' });
    }

    // Check if apartment exists
    const apartment = await prisma.apartment.findUnique({
      where: { id: apartmentId },
    });

    if (!apartment) {
      return reply.status(404).send({ error: 'Apartment not found' });
    }

    // Check if already favorited
    const existing = await prisma.favorite.findUnique({
      where: {
        userId_apartmentId: {
          userId: BigInt(tgUser.id),
          apartmentId,
        },
      },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Already in favorites' });
    }

    // Create favorite
    const favorite = await prisma.favorite.create({
      data: {
        userId: BigInt(tgUser.id),
        apartmentId,
      },
      include: {
        apartment: true,
      },
    });

    return {
      id: favorite.id,
      apartmentId: favorite.apartmentId,
      apartment: {
        id: favorite.apartment.id,
        title: favorite.apartment.title,
        city: favorite.apartment.city,
        price: favorite.apartment.price,
        currency: favorite.apartment.currency,
        rooms: favorite.apartment.rooms,
        photos: favorite.apartment.photos.slice(0, 1), // Just first photo for preview
      },
      createdAt: favorite.createdAt.toISOString(),
    };
  });

  // List user's favorites
  fastify.get('/favorites', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const tgUser = request.telegramUser;
    const query = request.query as { page?: string; limit?: string };

    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 50);
    const skip = (page - 1) * limit;

    const total = await prisma.favorite.count({
      where: { userId: BigInt(tgUser.id) },
    });

    const favorites = await prisma.favorite.findMany({
      where: { userId: BigInt(tgUser.id) },
      include: {
        apartment: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return {
      data: favorites.map((fav) => ({
        id: fav.id,
        apartmentId: fav.apartmentId,
        apartment: {
          id: fav.apartment.id,
          externalId: fav.apartment.externalId,
          url: fav.apartment.url,
          title: fav.apartment.title,
          city: fav.apartment.city,
          district: fav.apartment.district,
          propertyType: fav.apartment.propertyType,
          apartmentType: fav.apartment.apartmentType,
          price: fav.apartment.price,
          currency: fav.apartment.currency,
          rooms: fav.apartment.rooms,
          area: fav.apartment.area,
          floor: fav.apartment.floor,
          totalFloors: fav.apartment.totalFloors,
          photos: fav.apartment.photos,
          isActive: fav.apartment.isActive,
        },
        createdAt: fav.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // Remove from favorites
  fastify.delete('/favorites/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const tgUser = request.telegramUser;
    const { id } = request.params as { id: string };

    // Check ownership
    const favorite = await prisma.favorite.findFirst({
      where: {
        id,
        userId: BigInt(tgUser.id),
      },
    });

    if (!favorite) {
      return reply.status(404).send({ error: 'Favorite not found' });
    }

    await prisma.favorite.delete({ where: { id } });

    return { success: true };
  });

  // Remove from favorites by apartment ID (alternative endpoint)
  fastify.delete('/favorites/apartment/:apartmentId', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const tgUser = request.telegramUser;
    const { apartmentId } = request.params as { apartmentId: string };

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_apartmentId: {
          userId: BigInt(tgUser.id),
          apartmentId,
        },
      },
    });

    if (!favorite) {
      return reply.status(404).send({ error: 'Favorite not found' });
    }

    await prisma.favorite.delete({ where: { id: favorite.id } });

    return { success: true };
  });
}
