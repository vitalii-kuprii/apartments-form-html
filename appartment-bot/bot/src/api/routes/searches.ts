import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { PropertyType, ApartmentType } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import * as metrics from '../../lib/metrics.js';

interface CreateSearchBody {
  name?: string;
  city: string;
  propertyType: 'rent' | 'buy';
  apartmentType: 'flat' | 'house';
  priceMin?: number;
  priceMax?: number;
  currency?: 'UAH' | 'USD' | 'EUR';
  rooms?: number[];
  areaMin?: number;
  areaMax?: number;
  floorMin?: number;
  floorMax?: number;
  withoutRealtors?: boolean;
  petsFriendly?: boolean;
}

export async function searchRoutes(fastify: FastifyInstance) {
  // Create new search
  fastify.post('/searches', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, _reply) => {
    const tgUser = request.telegramUser;
    const body = request.body as CreateSearchBody;

    const userContext = {
      userId: tgUser.id,
      username: tgUser.username,
      firstName: tgUser.first_name,
    };

    const searchContext = {
      city: body.city,
      propertyType: body.propertyType,
      apartmentType: body.apartmentType,
      priceMin: body.priceMin,
      priceMax: body.priceMax,
      rooms: body.rooms,
      areaMin: body.areaMin,
      areaMax: body.areaMax,
      floorMin: body.floorMin,
      floorMax: body.floorMax,
      withoutRealtors: body.withoutRealtors,
      petsFriendly: body.petsFriendly,
    };

    logger.api.info('search.create_request', 'Search creation requested', {
      user: userContext,
      search: searchContext,
    });

    try {
      const search = await prisma.search.create({
        data: {
          userId: BigInt(tgUser.id),
          name: body.name,
          city: body.city,
          propertyType: body.propertyType as PropertyType,
          apartmentType: body.apartmentType as ApartmentType,
          priceMin: body.priceMin,
          priceMax: body.priceMax,
          currency: body.currency || 'UAH',
          rooms: body.rooms || [],
          areaMin: body.areaMin,
          areaMax: body.areaMax,
          floorMin: body.floorMin,
          floorMax: body.floorMax,
          withoutRealtors: body.withoutRealtors || false,
          petsFriendly: body.petsFriendly || false,
        },
      });

      // Log success
      logger.api.searchCreated(userContext, { ...searchContext, searchId: search.id }, 'api');

      // Track metrics
      metrics.searchCreated.inc({
        city: body.city,
        property_type: body.propertyType,
        apartment_type: body.apartmentType,
        source: 'api',
      });
      metrics.searchDbOperations.inc({ operation: 'create', status: 'success' });

      return {
        id: search.id,
        name: search.name,
        city: search.city,
        propertyType: search.propertyType,
        apartmentType: search.apartmentType,
        priceMin: search.priceMin,
        priceMax: search.priceMax,
        currency: search.currency,
        rooms: search.rooms,
        areaMin: search.areaMin,
        areaMax: search.areaMax,
        floorMin: search.floorMin,
        floorMax: search.floorMax,
        withoutRealtors: search.withoutRealtors,
        petsFriendly: search.petsFriendly,
        isActive: search.isActive,
        notifyEnabled: search.notifyEnabled,
        createdAt: search.createdAt.toISOString(),
      };
    } catch (error) {
      logger.api.searchDbError(userContext, searchContext, error as Error);
      metrics.searchDbOperations.inc({ operation: 'create', status: 'error' });
      metrics.errors.inc({ type: 'db_error', component: 'api' });
      throw error;
    }
  });

  // Get all user searches
  fastify.get('/searches', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const tgUser = request.telegramUser;

    const searches = await prisma.search.findMany({
      where: { userId: BigInt(tgUser.id) },
      orderBy: { createdAt: 'desc' },
    });

    return searches.map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      propertyType: s.propertyType,
      apartmentType: s.apartmentType,
      priceMin: s.priceMin,
      priceMax: s.priceMax,
      currency: s.currency,
      rooms: s.rooms,
      areaMin: s.areaMin,
      areaMax: s.areaMax,
      floorMin: s.floorMin,
      floorMax: s.floorMax,
      withoutRealtors: s.withoutRealtors,
      petsFriendly: s.petsFriendly,
      isActive: s.isActive,
      notifyEnabled: s.notifyEnabled,
      createdAt: s.createdAt.toISOString(),
    }));
  });

  // Get single search
  fastify.get('/searches/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const tgUser = request.telegramUser;
    const { id } = request.params as { id: string };

    const search = await prisma.search.findFirst({
      where: {
        id,
        userId: BigInt(tgUser.id),
      },
    });

    if (!search) {
      return reply.status(404).send({ error: 'Search not found' });
    }

    return {
      id: search.id,
      name: search.name,
      city: search.city,
      propertyType: search.propertyType,
      apartmentType: search.apartmentType,
      priceMin: search.priceMin,
      priceMax: search.priceMax,
      currency: search.currency,
      rooms: search.rooms,
      areaMin: search.areaMin,
      areaMax: search.areaMax,
      floorMin: search.floorMin,
      floorMax: search.floorMax,
      withoutRealtors: search.withoutRealtors,
      petsFriendly: search.petsFriendly,
      isActive: search.isActive,
      notifyEnabled: search.notifyEnabled,
      createdAt: search.createdAt.toISOString(),
    };
  });

  // Update search
  fastify.put('/searches/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const tgUser = request.telegramUser;
    const { id } = request.params as { id: string };
    const body = request.body as Partial<CreateSearchBody> & {
      isActive?: boolean;
      notifyEnabled?: boolean;
    };

    // Check ownership
    const existing = await prisma.search.findFirst({
      where: { id, userId: BigInt(tgUser.id) },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Search not found' });
    }

    const search = await prisma.search.update({
      where: { id },
      data: {
        name: body.name,
        city: body.city,
        propertyType: body.propertyType as PropertyType | undefined,
        apartmentType: body.apartmentType as ApartmentType | undefined,
        priceMin: body.priceMin,
        priceMax: body.priceMax,
        currency: body.currency,
        rooms: body.rooms,
        areaMin: body.areaMin,
        areaMax: body.areaMax,
        floorMin: body.floorMin,
        floorMax: body.floorMax,
        withoutRealtors: body.withoutRealtors,
        petsFriendly: body.petsFriendly,
        isActive: body.isActive,
        notifyEnabled: body.notifyEnabled,
      },
    });

    return {
      id: search.id,
      name: search.name,
      city: search.city,
      propertyType: search.propertyType,
      apartmentType: search.apartmentType,
      priceMin: search.priceMin,
      priceMax: search.priceMax,
      currency: search.currency,
      rooms: search.rooms,
      areaMin: search.areaMin,
      areaMax: search.areaMax,
      floorMin: search.floorMin,
      floorMax: search.floorMax,
      withoutRealtors: search.withoutRealtors,
      petsFriendly: search.petsFriendly,
      isActive: search.isActive,
      notifyEnabled: search.notifyEnabled,
      createdAt: search.createdAt.toISOString(),
    };
  });

  // Delete search
  fastify.delete('/searches/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const tgUser = request.telegramUser;
    const { id } = request.params as { id: string };

    const userContext = {
      userId: tgUser.id,
      username: tgUser.username,
    };

    logger.api.info('search.delete_request', `Delete search requested: ${id}`, {
      user: userContext,
      search: { searchId: id },
    });

    // Check ownership
    const existing = await prisma.search.findFirst({
      where: { id, userId: BigInt(tgUser.id) },
    });

    if (!existing) {
      logger.api.warn('search.delete_not_found', `Search ${id} not found`, {
        user: userContext,
        search: { searchId: id },
      });
      return reply.status(404).send({ error: 'Search not found' });
    }

    try {
      await prisma.search.delete({ where: { id } });

      logger.api.searchDeleted(userContext, id);
      metrics.searchDeleted.inc({ city: existing.city });
      metrics.searchDbOperations.inc({ operation: 'delete', status: 'success' });

      return { success: true };
    } catch (error) {
      logger.api.error('search.delete_error', `Failed to delete search ${id}`, {
        user: userContext,
        search: { searchId: id },
        error: {
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
      });
      metrics.searchDbOperations.inc({ operation: 'delete', status: 'error' });
      metrics.errors.inc({ type: 'db_error', component: 'api' });
      throw error;
    }
  });
}
