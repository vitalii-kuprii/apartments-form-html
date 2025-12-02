import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { PropertyType, ApartmentType } from '@prisma/client';

interface ApartmentSearchQuery {
  city?: string;
  propertyType?: 'rent' | 'buy';
  apartmentType?: 'flat' | 'house';
  priceMin?: string;
  priceMax?: string;
  rooms?: string; // comma-separated: "1,2,3"
  areaMin?: string;
  areaMax?: string;
  page?: string;
  limit?: string;
}

export async function apartmentRoutes(fastify: FastifyInstance) {
  // Search apartments with filters
  fastify.get('/apartments', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const query = request.query as ApartmentSearchQuery;

    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 50); // Max 50 per page
    const skip = (page - 1) * limit;

    // Build where clause based on filters
    const where: any = {
      isActive: true,
    };

    if (query.city) {
      where.city = query.city;
    }

    if (query.propertyType) {
      where.propertyType = query.propertyType as PropertyType;
    }

    if (query.apartmentType) {
      where.apartmentType = query.apartmentType as ApartmentType;
    }

    if (query.priceMin || query.priceMax) {
      where.price = {};
      if (query.priceMin) {
        where.price.gte = parseInt(query.priceMin, 10);
      }
      if (query.priceMax) {
        where.price.lte = parseInt(query.priceMax, 10);
      }
    }

    if (query.rooms) {
      const roomsArray = query.rooms.split(',').map((r) => parseInt(r.trim(), 10));
      where.rooms = { in: roomsArray };
    }

    if (query.areaMin || query.areaMax) {
      where.area = {};
      if (query.areaMin) {
        where.area.gte = parseFloat(query.areaMin);
      }
      if (query.areaMax) {
        where.area.lte = parseFloat(query.areaMax);
      }
    }

    // Get total count for pagination
    const total = await prisma.apartment.count({ where });

    // Get apartments
    const apartments = await prisma.apartment.findMany({
      where,
      orderBy: { firstSeenAt: 'desc' },
      skip,
      take: limit,
    });

    return {
      data: apartments.map((apt) => ({
        id: apt.id,
        externalId: apt.externalId,
        url: apt.url,
        title: apt.title,
        description: apt.description,
        city: apt.city,
        district: apt.district,
        address: apt.address,
        propertyType: apt.propertyType,
        apartmentType: apt.apartmentType,
        price: apt.price,
        currency: apt.currency,
        rooms: apt.rooms,
        area: apt.area,
        floor: apt.floor,
        totalFloors: apt.totalFloors,
        photos: apt.photos,
        isFromRealtor: apt.isFromRealtor,
        petsFriendly: apt.petsFriendly,
        publishedAt: apt.publishedAt?.toISOString(),
        firstSeenAt: apt.firstSeenAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // Get single apartment by ID
  fastify.get('/apartments/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const tgUser = request.telegramUser;

    const apartment = await prisma.apartment.findUnique({
      where: { id },
    });

    if (!apartment) {
      return reply.status(404).send({ error: 'Apartment not found' });
    }

    // Check if user has favorited this apartment
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_apartmentId: {
          userId: BigInt(tgUser.id),
          apartmentId: id,
        },
      },
    });

    return {
      id: apartment.id,
      externalId: apartment.externalId,
      url: apartment.url,
      title: apartment.title,
      description: apartment.description,
      city: apartment.city,
      district: apartment.district,
      address: apartment.address,
      propertyType: apartment.propertyType,
      apartmentType: apartment.apartmentType,
      price: apartment.price,
      currency: apartment.currency,
      rooms: apartment.rooms,
      area: apartment.area,
      floor: apartment.floor,
      totalFloors: apartment.totalFloors,
      photos: apartment.photos,
      isFromRealtor: apartment.isFromRealtor,
      petsFriendly: apartment.petsFriendly,
      publishedAt: apartment.publishedAt?.toISOString(),
      firstSeenAt: apartment.firstSeenAt.toISOString(),
      lastSeenAt: apartment.lastSeenAt.toISOString(),
      isFavorited: !!favorite,
    };
  });
}
