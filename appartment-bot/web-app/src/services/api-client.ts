// API client for communicating with the bot backend

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        close: () => void;
      };
    };
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function getInitData(): string {
  return window.Telegram?.WebApp?.initData || '';
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const initData = getInitData();
  const url = `${API_BASE_URL}${endpoint}`;

  console.log(`[API] ${options.method || 'GET'} ${url}`);

  // Only set Content-Type for requests with a body
  const headers: Record<string, string> = {
    'X-Telegram-Init-Data': initData,
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  console.log(`[API] Response status: ${response.status}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    console.error(`[API] Error:`, error);
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Auth
export async function authenticate() {
  return apiRequest<{
    id: string;
    username: string | null;
    firstName: string | null;
    notificationsEnabled: boolean;
  }>('/auth', { method: 'POST' });
}

// User
export async function getUser() {
  return apiRequest<{
    id: string;
    username: string | null;
    firstName: string | null;
    notificationsEnabled: boolean;
    searchesCount: number;
    favoritesCount: number;
  }>('/user');
}

// Searches
export interface ApiSearch {
  id: string;
  name: string | null;
  city: string;
  propertyType: 'rent' | 'buy';
  apartmentType: 'flat' | 'house';
  priceMin: number | null;
  priceMax: number | null;
  rooms: number[];
  areaMin: number | null;
  areaMax: number | null;
  floorMin: number | null;
  floorMax: number | null;
  withoutRealtors: boolean;
  petsFriendly: boolean;
  isActive: boolean;
  notifyEnabled: boolean;
  createdAt: string;
}

export interface CreateSearchData {
  name?: string;
  city: string;
  propertyType: 'rent' | 'buy';
  apartmentType: 'flat' | 'house';
  priceMin?: number;
  priceMax?: number;
  currency: 'UAH' | 'USD' | 'EUR';
  rooms?: number[];
  areaMin?: number;
  areaMax?: number;
  floorMin?: number;
  floorMax?: number;
  withoutRealtors?: boolean;
  petsFriendly?: boolean;
}

export async function getSearches() {
  return apiRequest<ApiSearch[]>('/searches');
}

export async function getSearch(id: string) {
  return apiRequest<ApiSearch>(`/searches/${id}`);
}

export async function createSearch(data: CreateSearchData) {
  return apiRequest<ApiSearch>('/searches', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSearch(id: string, data: Partial<CreateSearchData> & { isActive?: boolean; notifyEnabled?: boolean }) {
  return apiRequest<ApiSearch>(`/searches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSearch(id: string) {
  return apiRequest<{ success: boolean }>(`/searches/${id}`, {
    method: 'DELETE',
  });
}

// Favorites
export interface ApiFavorite {
  id: string;
  apartmentId: string;
  apartment: {
    id: string;
    externalId: string;
    url: string;
    title: string;
    city: string;
    district: string | null;
    propertyType: 'rent' | 'buy';
    apartmentType: 'flat' | 'house';
    price: number;
    currency: string;
    rooms: number | null;
    area: number | null;
    floor: number | null;
    totalFloors: number | null;
    photos: string[];
    isActive: boolean;
  };
  createdAt: string;
}

export async function getFavorites(page = 1, limit = 20) {
  return apiRequest<{
    data: ApiFavorite[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/favorites?page=${page}&limit=${limit}`);
}

export async function addFavorite(apartmentId: string) {
  return apiRequest<ApiFavorite>('/favorites', {
    method: 'POST',
    body: JSON.stringify({ apartmentId }),
  });
}

export async function removeFavorite(id: string) {
  return apiRequest<{ success: boolean }>(`/favorites/${id}`, {
    method: 'DELETE',
  });
}

// Apartments
export interface ApiApartment {
  id: string;
  externalId: string;
  url: string;
  title: string;
  description: string | null;
  city: string;
  district: string | null;
  address: string | null;
  propertyType: 'rent' | 'buy';
  apartmentType: 'flat' | 'house';
  price: number;
  currency: string;
  rooms: number | null;
  area: number | null;
  floor: number | null;
  totalFloors: number | null;
  photos: string[];
  isFromRealtor: boolean;
  petsFriendly: boolean;
  publishedAt: string | null;
  firstSeenAt: string;
  isFavorited?: boolean;
}

export async function searchApartments(filters: {
  city?: string;
  propertyType?: 'rent' | 'buy';
  apartmentType?: 'flat' | 'house';
  priceMin?: number;
  priceMax?: number;
  rooms?: number[];
  areaMin?: number;
  areaMax?: number;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters.city) params.set('city', filters.city);
  if (filters.propertyType) params.set('propertyType', filters.propertyType);
  if (filters.apartmentType) params.set('apartmentType', filters.apartmentType);
  if (filters.priceMin) params.set('priceMin', String(filters.priceMin));
  if (filters.priceMax) params.set('priceMax', String(filters.priceMax));
  if (filters.rooms?.length) params.set('rooms', filters.rooms.join(','));
  if (filters.areaMin) params.set('areaMin', String(filters.areaMin));
  if (filters.areaMax) params.set('areaMax', String(filters.areaMax));
  params.set('page', String(filters.page || 1));
  params.set('limit', String(filters.limit || 20));

  return apiRequest<{
    data: ApiApartment[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/apartments?${params}`);
}

export async function getApartment(id: string) {
  return apiRequest<ApiApartment>(`/apartments/${id}`);
}
