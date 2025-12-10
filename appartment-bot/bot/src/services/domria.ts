// DOM.RIA API Client Service
// https://developers.ria.com/

import { checkCircuit, recordError, recordSuccess } from '../lib/circuitBreaker.js';
import * as metrics from '../lib/metrics.js';

const API_BASE_URL = 'https://developers.ria.com/dom';
const PHOTO_BASE_URL = 'https://cdn.riastatic.com/photos';

// City mapping: Ukrainian city name -> DOM.RIA IDs
export const CITY_MAPPING: Record<string, { stateId: number; cityId: number }> = {
  'Київ': { stateId: 10, cityId: 10 },
  'Одеса': { stateId: 12, cityId: 12 },
  'Харків': { stateId: 7, cityId: 7 },
  'Львів': { stateId: 5, cityId: 5 },
  'Дніпро': { stateId: 11, cityId: 11 },
  'Запоріжжя': { stateId: 14, cityId: 14 },
  'Вінниця': { stateId: 1, cityId: 1 },
  'Полтава': { stateId: 20, cityId: 20 },
  'Черкаси': { stateId: 24, cityId: 24 },
  'Житомир': { stateId: 2, cityId: 2 },
  'Тернопіль': { stateId: 3, cityId: 3 },
  'Івано-Франківськ': { stateId: 15, cityId: 15 },
  'Луцьк': { stateId: 18, cityId: 18 },
  'Рівне': { stateId: 9, cityId: 9 },
  'Хмельницький': { stateId: 4, cityId: 4 },
  'Чернівці': { stateId: 25, cityId: 25 },
  'Суми': { stateId: 8, cityId: 8 },
  'Чернігів': { stateId: 6, cityId: 6 },
  'Кропивницький': { stateId: 16, cityId: 16 },
  'Миколаїв': { stateId: 19, cityId: 19 },
};

// Operation types
export const OPERATION_TYPES = {
  rent: 3,    // Long-term rent
  buy: 1,     // Sale
} as const;

// Realty types
export const REALTY_TYPES = {
  flat: 2,    // Apartment
  house: 3,   // House
} as const;

export interface DomRiaSearchParams {
  city: string;
  propertyType: 'rent' | 'buy';
  apartmentType: 'flat' | 'house';
  priceMin?: number;
  priceMax?: number;
  rooms?: number[];
  areaMin?: number;
  areaMax?: number;
  floorMin?: number;
  floorMax?: number;
  dateFrom?: Date;          // Only fetch apartments published after this date
  photosCountFrom?: number; // Only fetch apartments with at least N photos
}

export interface DomRiaSearchResult {
  count: number;
  items: number[];
}

export interface DomRiaApartment {
  realty_id: number;
  city_name_uk: string;
  city_name: string;
  district_name_uk: string;
  district_name: string;
  street_name_uk: string;
  street_name: string;
  building_number_str: string;
  building_number_for_map: string;
  price: number;
  price_total: number;
  currency_type: string;
  currency_type_id: number; // 1=USD, 2=EUR, 3=UAH
  priceArr?: {
    '1'?: string; // USD (formatted like "35 000")
    '2'?: string; // EUR
    '3'?: string; // UAH
  };
  rooms_count: number;
  total_square_meters: number;
  living_square_meters: number;
  kitchen_square_meters: number;
  floor: number;
  floors_count: number;
  description_uk: string;
  description: string;
  main_photo: string;
  photos: Record<string, { file: string; ordering: number }>;
  photos_count: number;
  beautiful_url: string;
  advert_type_id: number;
  realty_type_id: number;
  publishing_date: string;
  publishing_date_ts: number;
  created_at: string;
  created_at_ts: number;
  agency?: {
    agency_id: number;
    agency_type: number;
    name: string;
  };
  latitude: number;
  longitude: number;
  withAnimal: boolean;
}

export class DomRiaClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private buildSearchUrl(params: DomRiaSearchParams): string {
    const cityMapping = CITY_MAPPING[params.city];
    if (!cityMapping) {
      throw new Error(`Unknown city: ${params.city}`);
    }

    const queryParams = new URLSearchParams();
    queryParams.set('api_key', this.apiKey);
    queryParams.set('category', '1'); // Residential
    queryParams.set('realty_type', String(REALTY_TYPES[params.apartmentType]));
    queryParams.set('operation_type', String(OPERATION_TYPES[params.propertyType]));
    queryParams.set('state_id', String(cityMapping.stateId));
    queryParams.set('city_id', String(cityMapping.cityId));

    // Price filter - characteristic[235] for rent, characteristic[234] for buy
    const priceCharId = params.propertyType === 'rent' ? '235' : '234';
    if (params.priceMin) {
      queryParams.set(`characteristic[${priceCharId}][from]`, String(params.priceMin));
    }
    if (params.priceMax) {
      queryParams.set(`characteristic[${priceCharId}][to]`, String(params.priceMax));
    }

    // Rooms filter - characteristic[209]
    if (params.rooms && params.rooms.length > 0) {
      const minRooms = Math.min(...params.rooms);
      const maxRooms = Math.max(...params.rooms);
      queryParams.set('characteristic[209][from]', String(minRooms));
      if (maxRooms < 4) {
        queryParams.set('characteristic[209][to]', String(maxRooms));
      }
    }

    // Area filter - characteristic[214]
    if (params.areaMin) {
      queryParams.set('characteristic[214][from]', String(params.areaMin));
    }
    if (params.areaMax) {
      queryParams.set('characteristic[214][to]', String(params.areaMax));
    }

    // Floor filter - characteristic[227]
    if (params.floorMin) {
      queryParams.set('characteristic[227][from]', String(params.floorMin));
    }
    if (params.floorMax) {
      queryParams.set('characteristic[227][to]', String(params.floorMax));
    }

    // Date filter - only fetch apartments published after this date
    // DOM.RIA expects YYYY-MM-DD format, not Unix timestamp
    if (params.dateFrom) {
      const dateString = params.dateFrom.toISOString().split('T')[0] || '';
      queryParams.set('date_from', dateString);
    }

    // Photo filter - only fetch apartments with at least N photos
    if (params.photosCountFrom) {
      queryParams.set('photos_count_from', String(params.photosCountFrom));
    }

    // Sort by newest first
    queryParams.set('sort', 'date_desc');

    // Filter out duplicates from DOM.RIA
    queryParams.set('wo_dupl', '1');

    return `${API_BASE_URL}/search?${queryParams.toString()}`;
  }

  async search(params: DomRiaSearchParams): Promise<DomRiaSearchResult> {
    // Check circuit breaker before making request
    await checkCircuit();

    const url = this.buildSearchUrl(params);
    console.log(`[DomRIA] Search: ${url.replace(this.apiKey, '***')}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        await recordError(`HTTP ${response.status}: ${response.statusText}`);
        metrics.circuitBreakerErrors.inc();
        throw new Error(`DOM.RIA search failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as DomRiaSearchResult;
      console.log(`[DomRIA] Found ${data.count} apartments, returned ${data.items?.length || 0} IDs`);

      await recordSuccess();
      return data;
    } catch (error) {
      if ((error as Error).message.includes('Circuit breaker')) {
        throw error; // Re-throw circuit breaker errors
      }
      await recordError((error as Error).message);
      metrics.circuitBreakerErrors.inc();
      throw error;
    }
  }

  async getApartmentDetails(realtyId: number): Promise<DomRiaApartment> {
    // Check circuit breaker before making request
    await checkCircuit();

    const url = `${API_BASE_URL}/info/${realtyId}?api_key=${this.apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        await recordError(`HTTP ${response.status}: ${response.statusText}`);
        metrics.circuitBreakerErrors.inc();
        throw new Error(`DOM.RIA info failed: ${response.status} ${response.statusText}`);
      }

      await recordSuccess();
      return response.json() as Promise<DomRiaApartment>;
    } catch (error) {
      if ((error as Error).message.includes('Circuit breaker')) {
        throw error;
      }
      await recordError((error as Error).message);
      metrics.circuitBreakerErrors.inc();
      throw error;
    }
  }

  async getApartmentsBatch(realtyIds: number[], batchSize = 10): Promise<DomRiaApartment[]> {
    const results: DomRiaApartment[] = [];

    // Process in batches to avoid rate limiting
    for (let i = 0; i < realtyIds.length; i += batchSize) {
      const batch = realtyIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(id => this.getApartmentDetails(id).catch(err => {
          console.error(`[DomRIA] Failed to fetch apartment ${id}:`, err.message);
          return null;
        }))
      );

      results.push(...batchResults.filter((r): r is DomRiaApartment => r !== null));

      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < realtyIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  getPhotoUrl(photoPath: string, size: 'original' | 'big' | 'medium' | 'small' = 'big'): string {
    // DOM.RIA photo paths look like: dom/photo/32732/3273223/327322370/327322370.jpg
    // Full URL: https://cdn.riastatic.com/photos/dom/photo/32732/3273223/327322370/327322370b.jpg
    // Sizes: original (no suffix), b (big), m (medium), s (small)
    const sizeMap = {
      original: '',
      big: 'b',
      medium: 'm',
      small: 's',
    };

    const suffix = sizeMap[size];
    const photoUrl = photoPath.replace(/\.jpg$/, `${suffix}.jpg`);

    return `${PHOTO_BASE_URL}/${photoUrl}`;
  }

  getApartmentUrl(beautifulUrl: string): string {
    return `https://dom.ria.com/uk/${beautifulUrl}`;
  }
}

// Helper to check if apartment is from a realtor (agency)
export function isFromRealtor(apartment: DomRiaApartment): boolean {
  return !!(apartment.agency && apartment.agency.agency_type !== undefined);
}

// Create singleton instance
let domRiaClient: DomRiaClient | null = null;

export function getDomRiaClient(): DomRiaClient {
  if (!domRiaClient) {
    const apiKey = process.env.DOMRIA_API_KEY;
    if (!apiKey) {
      throw new Error('DOMRIA_API_KEY environment variable is not set');
    }
    domRiaClient = new DomRiaClient(apiKey);
  }
  return domRiaClient;
}
