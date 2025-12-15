// Apartment Fetcher Job
// Fetches apartments from DOM.RIA based on active user searches
// Optimized to reduce API calls with dateFrom, photosCountFrom, and DB checks

import { prisma } from '../lib/prisma.js';
import { getDomRiaClient, DomRiaApartment, isFromRealtor, CITY_MAPPING } from '../services/domria.js';
import { PropertyType, ApartmentType } from '@prisma/client';
import { getCityLastFetch, setCityLastFetch, incrementApiStats } from './scheduler.js';
import { logger } from '../lib/logger.js';
import * as metrics from '../lib/metrics.js';

// Minimum photos required (skip listings with fewer photos)
const MIN_PHOTOS_COUNT = 3;

// Parse price from formatted string "35 000" -> 35000
function parsePrice(priceStr?: string): number | null {
  if (!priceStr) return null;
  const parsed = parseInt(priceStr.replace(/\s/g, ''), 10);
  return isNaN(parsed) ? null : parsed;
}

export interface SearchGroup {
  city: string;
  propertyType: PropertyType;
  apartmentType: ApartmentType;
  searches: {
    id: string;
    userId: bigint;
    priceMin: number | null;
    priceMax: number | null;
    currency: string; // USD, EUR, UAH
    rooms: number[];
    areaMin: number | null;
    areaMax: number | null;
    floorMin: number | null;
    floorMax: number | null;
    withoutRealtors: boolean;
    petsFriendly: boolean;
    notifyEnabled: boolean;
  }[];
}

// Extract commission from description text
function extractCommission(description: string | null): string | null {
  if (!description) return null;

  // Match patterns like "Комісія 50%", "комісія АН 50%", "комісія агентства 50%"
  const patterns = [
    /комісія[^0-9]*(\d+%)/i,
    /комісія[^0-9]*(\d+\s*грн)/i,
    /комісія[^0-9]*(\d+\s*\$)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// Map DOM.RIA apartment to our database format
function mapDomRiaApartment(
  apartment: DomRiaApartment,
  propertyType: PropertyType,
  apartmentType: ApartmentType
) {
  const client = getDomRiaClient();

  // Get first 5 photos
  const photoUrls: string[] = [];
  if (apartment.photos) {
    const photoEntries = Object.values(apartment.photos)
      .sort((a, b) => a.ordering - b.ordering)
      .slice(0, 5);

    for (const photo of photoEntries) {
      photoUrls.push(client.getPhotoUrl(photo.file, 'big'));
    }
  }

  // If no photos from the photos object, try main_photo
  if (photoUrls.length === 0 && apartment.main_photo) {
    photoUrls.push(client.getPhotoUrl(apartment.main_photo, 'big'));
  }

  const description = apartment.description_uk || apartment.description || null;

  // Build title with null checks
  const roomsPart = apartment.rooms_count ? `${apartment.rooms_count}-кімнатна ` : '';
  const typePart = apartmentType === 'flat' ? 'Квартира' : 'Будинок';
  const areaPart = apartment.total_square_meters ? `, ${apartment.total_square_meters} м²` : '';
  const title = `${roomsPart}${typePart}${areaPart}`;

  // Parse all 3 prices from priceArr
  const priceUsd = parsePrice(apartment.priceArr?.['1']);
  const priceEur = parsePrice(apartment.priceArr?.['2']);
  const priceUah = parsePrice(apartment.priceArr?.['3']);

  return {
    externalId: String(apartment.realty_id),
    url: client.getApartmentUrl(apartment.beautiful_url),
    title,
    description,
    city: apartment.city_name_uk || apartment.city_name,
    district: apartment.district_name_uk || apartment.district_name || null,
    address: apartment.street_name_uk
      ? (() => {
          const buildingNumber = apartment.building_number_str || apartment.building_number_for_map;
          return `${apartment.street_name_uk}${buildingNumber ? `, ${buildingNumber}` : ''}`;
        })()
      : null,
    propertyType,
    apartmentType,
    price: apartment.price || apartment.price_total || 0,
    priceUsd,
    priceEur,
    priceUah,
    currency: apartment.currency_type || 'UAH',
    rooms: apartment.rooms_count || null,
    area: apartment.total_square_meters || null,
    floor: apartment.floor || null,
    totalFloors: apartment.floors_count || null,
    photos: photoUrls,
    isFromRealtor: isFromRealtor(apartment),
    agencyName: apartment.agency?.name || null,
    commission: extractCommission(description),
    petsFriendly: apartment.withAnimal || false,
    publishedAt: apartment.publishing_date ? new Date(apartment.publishing_date) : null,
  };
}

// Get apartment price in the specified currency
function getApartmentPrice(
  apartment: { price: number; priceUsd?: number | null; priceEur?: number | null; priceUah?: number | null },
  currency: string
): number | null {
  switch (currency) {
    case 'USD': return apartment.priceUsd ?? null;
    case 'EUR': return apartment.priceEur ?? null;
    case 'UAH': return apartment.priceUah ?? null;
    default: return apartment.priceUah ?? apartment.price;
  }
}

// Check if apartment matches search criteria
function apartmentMatchesSearch(
  apartment: {
    price: number;
    priceUsd?: number | null;
    priceEur?: number | null;
    priceUah?: number | null;
    rooms: number | null;
    area: number | null;
    floor: number | null;
    isFromRealtor: boolean;
  },
  search: {
    priceMin: number | null;
    priceMax: number | null;
    currency: string;
    rooms: number[];
    areaMin: number | null;
    areaMax: number | null;
    floorMin: number | null;
    floorMax: number | null;
    withoutRealtors: boolean;
  }
): boolean {
  // Get price in search's currency
  const price = getApartmentPrice(apartment, search.currency || 'UAH');

  // Check price (skip if price not available in this currency)
  if (price === null) return false;
  if (search.priceMin && price < search.priceMin) return false;
  if (search.priceMax && price > search.priceMax) return false;

  // Check rooms
  if (search.rooms.length > 0 && apartment.rooms !== null) {
    // Handle "4+" case - if user selected 4, accept 4 or more
    const maxSelected = Math.max(...search.rooms);
    const hasMatch = search.rooms.includes(apartment.rooms) ||
      (maxSelected === 4 && apartment.rooms >= 4);
    if (!hasMatch) return false;
  }

  // Check area
  if (search.areaMin && apartment.area !== null && apartment.area < search.areaMin) return false;
  if (search.areaMax && apartment.area !== null && apartment.area > search.areaMax) return false;

  // Check floor
  if (search.floorMin && apartment.floor !== null && apartment.floor < search.floorMin) return false;
  if (search.floorMax && apartment.floor !== null && apartment.floor > search.floorMax) return false;

  // Check realtor filter
  if (search.withoutRealtors && apartment.isFromRealtor) return false;

  return true;
}

// Group searches by city/propertyType/apartmentType for efficient API calls
async function groupSearches(): Promise<SearchGroup[]> {
  const searches = await prisma.search.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      userId: true,
      city: true,
      propertyType: true,
      apartmentType: true,
      priceMin: true,
      priceMax: true,
      currency: true,
      rooms: true,
      areaMin: true,
      areaMax: true,
      floorMin: true,
      floorMax: true,
      withoutRealtors: true,
      petsFriendly: true,
      notifyEnabled: true,
    },
  });

  const groups = new Map<string, SearchGroup>();

  for (const search of searches) {
    // Skip cities not in our mapping
    if (!CITY_MAPPING[search.city]) {
      logger.fetcher.warn('fetch.city_not_mapped', `Skipping search - city not in mapping`, {
        searchId: search.id,
        city: search.city,
        userId: search.userId.toString(),
      });
      continue;
    }

    const key = `${search.city}-${search.propertyType}-${search.apartmentType}`;

    if (!groups.has(key)) {
      groups.set(key, {
        city: search.city,
        propertyType: search.propertyType,
        apartmentType: search.apartmentType,
        searches: [],
      });
    }

    groups.get(key)!.searches.push({
      id: search.id,
      userId: search.userId,
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
      notifyEnabled: search.notifyEnabled,
    });
  }

  return Array.from(groups.values());
}

// Fetch and store apartments for a group
async function fetchGroupApartments(group: SearchGroup): Promise<{
  newApartments: Array<{ id: string; apartment: ReturnType<typeof mapDomRiaApartment> }>;
  matchedSearches: Map<string, string[]>; // apartmentId -> searchIds[]
  apiFound: number; // How many apartments API returned
}> {
  const client = getDomRiaClient();
  const newApartments: Array<{ id: string; apartment: ReturnType<typeof mapDomRiaApartment> }> = [];
  const matchedSearches = new Map<string, string[]>();
  let apiFound = 0;

  try {
    // ========== STEP 1: Log all searches in group ==========
    logger.fetcher.info('fetch.group_searches', `${group.city} searches`, {
      city: group.city,
      propertyType: group.propertyType,
      apartmentType: group.apartmentType,
      searchCount: group.searches.length,
      searches: group.searches.map(s => ({
        id: s.id,
        priceMin: s.priceMin,
        priceMax: s.priceMax,
        currency: s.currency,
        rooms: s.rooms,
      })),
    });

    // ========== STEP 2: Sub-group searches by currency ==========
    const searchesByCurrency = new Map<string, typeof group.searches>();
    for (const search of group.searches) {
      const currency = search.currency || 'UAH';
      if (!searchesByCurrency.has(currency)) {
        searchesByCurrency.set(currency, []);
      }
      searchesByCurrency.get(currency)!.push(search);
    }

    // ========== STEP 3: Calculate shared params (rooms, date) ==========
    const allRooms = new Set<number>();
    group.searches.forEach(s => s.rooms.forEach(r => allRooms.add(r)));
    const roomsArray = Array.from(allRooms).filter(r => r <= 3 || allRooms.has(4));

    const lastFetch = await getCityLastFetch(group.city);
    const dateFrom = lastFetch || new Date(Date.now() - 24 * 60 * 60 * 1000);

    // ========== STEP 4: API calls per currency, collect IDs ==========
    const allApartmentIds = new Set<number>();

    for (const [currency, searches] of searchesByCurrency) {
      // Calculate price range for THIS currency only (valid to combine!)
      const priceMinValues = searches.filter(s => s.priceMin !== null).map(s => s.priceMin!);
      const priceMin = priceMinValues.length > 0 ? Math.min(...priceMinValues) : undefined;

      const priceMaxValues = searches.filter(s => s.priceMax !== null).map(s => s.priceMax!);
      const priceMax = priceMaxValues.length > 0 ? Math.max(...priceMaxValues) : undefined;

      // Log currency subgroup
      logger.fetcher.info('fetch.currency_subgroup', `${group.city} ${currency} subgroup`, {
        city: group.city,
        propertyType: group.propertyType,
        currency,
        searchCount: searches.length,
        searches: searches.map(s => ({
          id: s.id,
          priceMin: s.priceMin,
          priceMax: s.priceMax,
        })),
        combinedPriceMin: priceMin,
        combinedPriceMax: priceMax,
      });

      logger.domria.domriaSearchRequest(group.city, {
        dateFrom: dateFrom.toISOString(),
        priceMin,
        priceMax,
        currency,
        rooms: roomsArray,
        propertyType: group.propertyType,
        apartmentType: group.apartmentType,
        photosCountFrom: MIN_PHOTOS_COUNT,
      });

      // Search DOM.RIA with currency-specific price filter
      const searchResult = await client.search({
        city: group.city,
        propertyType: group.propertyType,
        apartmentType: group.apartmentType,
        priceMin,
        priceMax,
        currency: currency as 'USD' | 'EUR' | 'UAH',
        rooms: roomsArray.length > 0 ? roomsArray : undefined,
        dateFrom,
        photosCountFrom: MIN_PHOTOS_COUNT,
      });

      // Track API request
      await incrementApiStats('search');
      metrics.domriaRequests.inc({ endpoint: 'search', status: 'success' });

      // Log currency search results
      logger.fetcher.info('fetch.currency_results', `${group.city} ${currency} API results`, {
        city: group.city,
        propertyType: group.propertyType,
        currency,
        apartmentCount: searchResult.items.length,
        apartmentIds: searchResult.items.slice(0, 50),
      });

      // Add IDs to Set (automatically deduplicates!)
      for (const id of searchResult.items) {
        allApartmentIds.add(id);
      }
    }

    // ========== STEP 5: Merged unique IDs ==========
    const apartmentIdArray = [...allApartmentIds];
    apiFound = apartmentIdArray.length;

    logger.fetcher.info('fetch.merged_apartments', `${group.city} merged apartment IDs`, {
      city: group.city,
      propertyType: group.propertyType,
      apartmentType: group.apartmentType,
      currencySearches: searchesByCurrency.size,
      totalUniqueIds: allApartmentIds.size,
      apartmentIds: apartmentIdArray.slice(0, 50),
    });

    metrics.apartmentsFetched.inc(
      { city: group.city, property_type: group.propertyType, apartment_type: group.apartmentType },
      apartmentIdArray.length
    );

    if (apartmentIdArray.length === 0) {
      logger.fetcher.debug('fetch.no_apartments', `No apartments found for ${group.city}`, {
        city: group.city,
        propertyType: group.propertyType,
        apartmentType: group.apartmentType,
      });
      return { newApartments, matchedSearches, apiFound: 0 };
    }

    // ========== STEP 6: Check existing in DB ==========
    const existingIds = await prisma.apartment.findMany({
      where: {
        externalId: { in: apartmentIdArray.map(String) },
      },
      select: { id: true, externalId: true, priceUsd: true, priceEur: true, priceUah: true, price: true, rooms: true, area: true, floor: true, isFromRealtor: true },
    });
    const existingExternalIds = new Set(existingIds.map(a => a.externalId));
    const existingIdMap = new Map(existingIds.map(a => [a.externalId, a]));

    // Filter out apartments we already have
    const newExternalIds = apartmentIdArray.filter(id => !existingExternalIds.has(String(id)));

    logger.fetcher.info('fetch.merged_apartments_filtered', `${group.city} apartments to fetch`, {
      city: group.city,
      propertyType: group.propertyType,
      totalUniqueIds: apartmentIdArray.length,
      newToFetch: newExternalIds.length,
      alreadyInDb: existingExternalIds.size,
    });

    // Check matches for existing apartments
    for (const [, existingApartment] of existingIdMap) {
      const matches: string[] = [];
      for (const search of group.searches) {
        if (apartmentMatchesSearch(existingApartment, search)) {
          // Check if not already sent to this search
          const alreadySent = await prisma.sentApartment.findUnique({
            where: {
              searchId_apartmentId: {
                searchId: search.id,
                apartmentId: existingApartment.id,
              },
            },
          });
          if (!alreadySent) {
            matches.push(search.id);
          }
        }
      }
      if (matches.length > 0) {
        matchedSearches.set(existingApartment.id, matches);
      }
    }

    if (newExternalIds.length === 0) {
      logger.fetcher.info('fetch.all_existing', `All apartments already in database`, {
        city: group.city,
        propertyType: group.propertyType,
        apartmentType: group.apartmentType,
        existingCount: apartmentIdArray.length,
        matchedExisting: matchedSearches.size,
      });
      return { newApartments, matchedSearches, apiFound };
    }

    // ========== STEP 7: Fetch details for NEW apartments ONCE ==========
    logger.fetcher.info('fetch.fetching_details', `Fetching details for new apartments`, {
      city: group.city,
      propertyType: group.propertyType,
      apartmentType: group.apartmentType,
      newCount: newExternalIds.length,
      externalIds: newExternalIds.slice(0, 20),
    });

    // Fetch details for new apartments
    const apartmentDetails = await client.getApartmentsBatch(newExternalIds);

    // Track API requests (one per apartment detail)
    await incrementApiStats('detail', apartmentDetails.length);

    for (const detail of apartmentDetails) {
      // Log fetching each apartment
      logger.fetcher.info('fetch.fetching_detail', `Fetching ${group.city}-${group.propertyType} apartment ${detail.realty_id}`, {
        city: group.city,
        propertyType: group.propertyType,
        apartmentType: group.apartmentType,
        externalId: detail.realty_id,
      });

      const mappedApartment = mapDomRiaApartment(detail, group.propertyType, group.apartmentType);

      // Store in database
      const created = await prisma.apartment.upsert({
        where: { externalId: mappedApartment.externalId },
        create: mappedApartment,
        update: {
          lastSeenAt: new Date(),
          isActive: true,
        },
      });

      newApartments.push({ id: created.id, apartment: mappedApartment });

      // Log stored apartment
      logger.fetcher.info('fetch.stored_apartment', `Stored ${group.city}-${group.propertyType} apartment ${created.id}`, {
        city: group.city,
        propertyType: group.propertyType,
        apartmentType: group.apartmentType,
        apartmentId: created.id,
        externalId: mappedApartment.externalId,
        priceUsd: mappedApartment.priceUsd,
        priceEur: mappedApartment.priceEur,
        priceUah: mappedApartment.priceUah,
        rooms: mappedApartment.rooms,
        area: mappedApartment.area,
      });

      // Check which searches this apartment matches
      const matches: string[] = [];
      for (const search of group.searches) {
        if (apartmentMatchesSearch(mappedApartment, search)) {
          matches.push(search.id);
        }
      }

      if (matches.length > 0) {
        matchedSearches.set(created.id, matches);

        // Log matched apartment with full details
        logger.fetcher.apartmentMatched(
          {
            apartmentId: created.id,
            externalId: mappedApartment.externalId,
            price: mappedApartment.price,
            rooms: mappedApartment.rooms,
            area: mappedApartment.area,
            city: mappedApartment.city,
          },
          matches
        );
      }

      metrics.apartmentsStored.inc({
        city: group.city,
        is_new: 'true',
      });
    }

    // ========== STEP 8: Log group completion ==========
    logger.fetcher.info('fetch.group_complete', `${group.city} group completed`, {
      city: group.city,
      propertyType: group.propertyType,
      apartmentType: group.apartmentType,
      currencySearches: searchesByCurrency.size,
      totalApiCalls: searchesByCurrency.size,
      totalUniqueApartments: allApartmentIds.size,
      newApartmentsStored: newApartments.length,
      matchedToSearches: matchedSearches.size,
    });

  } catch (error) {
    logger.fetcher.fetchGroupError(group.city, error as Error);
    metrics.domriaRequests.inc({ endpoint: 'search', status: 'error' });
    metrics.errors.inc({ type: 'fetch_error', component: 'fetcher' });
  }

  return { newApartments, matchedSearches, apiFound };
}

// Per-city stats type
export interface CityFetchStats {
  found: number;
  storedToDb: number;
  matched: number;
}

// Main fetcher function
export async function runApartmentFetcher(): Promise<{
  totalNew: number;
  matchedApartments: Map<string, string[]>; // apartmentId -> searchIds that match
  cityStats: Record<string, CityFetchStats>; // Per-city breakdown
}> {
  const startTime = Date.now();

  logger.fetcher.fetchCycleStarted(0); // Will be updated after grouping

  let totalNew = 0;
  const allMatchedApartments = new Map<string, string[]>();
  const cityStats: Record<string, CityFetchStats> = {};

  try {
    // Group searches for efficient API usage
    const groups = await groupSearches();

    logger.fetcher.fetchCycleStarted(groups.length);

    // Process each group
    for (const group of groups) {
      const groupStartTime = Date.now();

      // Log group start with full params
      logger.fetcher.fetchGroupStarted(
        group.city,
        group.propertyType,
        group.apartmentType,
        group.searches.length,
        {
          searchIds: group.searches.map(s => s.id),
          priceRanges: group.searches.map(s => ({ min: s.priceMin, max: s.priceMax })),
          rooms: [...new Set(group.searches.flatMap(s => s.rooms))],
        }
      );

      const { newApartments, matchedSearches, apiFound } = await fetchGroupApartments(group);
      totalNew += newApartments.length;

      const groupDuration = Date.now() - groupStartTime;

      // Update city stats
      const cityKey = group.city;
      if (!cityStats[cityKey]) {
        cityStats[cityKey] = { found: 0, storedToDb: 0, matched: 0 };
      }
      cityStats[cityKey].found += apiFound;
      cityStats[cityKey].storedToDb += newApartments.length;
      cityStats[cityKey].matched += matchedSearches.size;

      // Merge matched searches
      for (const [apartmentId, searchIds] of matchedSearches) {
        const existing = allMatchedApartments.get(apartmentId) || [];
        allMatchedApartments.set(apartmentId, [...existing, ...searchIds]);
      }

      // Log group completion
      logger.fetcher.fetchGroupCompleted(
        group.city,
        newApartments.length + matchedSearches.size - newApartments.length, // found count
        newApartments.length,
        matchedSearches.size,
        groupDuration
      );

      // Track metrics
      metrics.fetchGroupDuration.observe(
        { city: group.city, property_type: group.propertyType },
        groupDuration / 1000
      );

      // Update last fetch timestamp for this city (for dateFrom filter in next run)
      await setCityLastFetch(group.city);

      // Add delay between groups to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const duration = Date.now() - startTime;

    // Log cycle completion
    logger.fetcher.fetchCycleCompleted(totalNew, allMatchedApartments.size, duration);

  } catch (error) {
    logger.fetcher.error('fetch.cycle_error', 'Error running apartment fetcher', {
      error: {
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
    });
    metrics.errors.inc({ type: 'fetch_error', component: 'fetcher' });
  }

  return { totalNew, matchedApartments: allMatchedApartments, cityStats };
}

// Export for use in scheduler
export { groupSearches, fetchGroupApartments, apartmentMatchesSearch };
