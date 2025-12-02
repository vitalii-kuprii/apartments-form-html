import * as api from './api-client';
import { Search, SearchFormData, Apartment } from '../types';

// Map API response (camelCase) to frontend format (snake_case)
function mapApiSearchToSearch(apiSearch: api.ApiSearch): Search {
  return {
    id: apiSearch.id,
    user_id: '', // Not needed on frontend
    city: apiSearch.city,
    property_type: apiSearch.propertyType,
    price_min: apiSearch.priceMin ?? 0,
    price_max: apiSearch.priceMax,
    rooms: apiSearch.rooms,
    area_min: apiSearch.areaMin ?? 0,
    area_max: apiSearch.areaMax,
    apartment_type: apiSearch.apartmentType,
    without_realtors: apiSearch.withoutRealtors,
    pets_friendly: apiSearch.petsFriendly,
    floor_min: apiSearch.floorMin ?? 1,
    floor_max: apiSearch.floorMax,
    is_active: apiSearch.isActive,
    created_at: apiSearch.createdAt,
    updated_at: apiSearch.createdAt, // API doesn't return updated_at in list
  };
}

// Map frontend format to API format
function mapFormDataToApiData(formData: SearchFormData): api.CreateSearchData {
  return {
    city: formData.city,
    propertyType: formData.property_type,
    apartmentType: formData.apartment_type,
    priceMin: formData.price_min || undefined,
    priceMax: formData.price_max || undefined,
    rooms: formData.rooms.length > 0 ? formData.rooms : undefined,
    areaMin: formData.area_min || undefined,
    areaMax: formData.area_max || undefined,
    floorMin: formData.floor_min || undefined,
    floorMax: formData.floor_max || undefined,
    withoutRealtors: formData.without_realtors,
    petsFriendly: formData.pets_friendly,
  };
}

// Map API favorite to frontend Apartment format
function mapApiFavoriteToApartment(apiFav: api.ApiFavorite): Apartment {
  return {
    id: apiFav.id, // Use favorite ID for removal
    user_id: '',
    external_id: apiFav.apartment.externalId,
    photo_url: apiFav.apartment.photos[0] || null,
    price: apiFav.apartment.price,
    rooms: apiFav.apartment.rooms || 0,
    area: apiFav.apartment.area || 0,
    address: apiFav.apartment.city + (apiFav.apartment.district ? `, ${apiFav.apartment.district}` : ''),
    listing_url: apiFav.apartment.url,
    created_at: apiFav.createdAt,
  };
}

export class DataService {
  private initialized = false;

  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      await api.authenticate();
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to authenticate:', error);
      return false;
    }
  }

  async getSearches(): Promise<Search[]> {
    try {
      const searches = await api.getSearches();
      return searches.map(mapApiSearchToSearch);
    } catch (error) {
      console.error('Error fetching searches:', error);
      return [];
    }
  }

  async createSearch(formData: SearchFormData): Promise<Search | null> {
    try {
      const apiData = mapFormDataToApiData(formData);
      const created = await api.createSearch(apiData);
      return mapApiSearchToSearch(created);
    } catch (error) {
      console.error('Error creating search:', error);
      return null;
    }
  }

  async updateSearch(id: string, formData: SearchFormData): Promise<Search | null> {
    try {
      const apiData = mapFormDataToApiData(formData);
      const updated = await api.updateSearch(id, apiData);
      return mapApiSearchToSearch(updated);
    } catch (error) {
      console.error('Error updating search:', error);
      return null;
    }
  }

  async deleteSearch(id: string): Promise<boolean> {
    try {
      console.log('[DataService] Deleting search:', id);
      const result = await api.deleteSearch(id);
      console.log('[DataService] Delete result:', result);
      return true;
    } catch (error) {
      console.error('[DataService] Error deleting search:', error);
      return false;
    }
  }

  async toggleSearchActive(id: string, isActive: boolean): Promise<boolean> {
    try {
      await api.updateSearch(id, { isActive });
      return true;
    } catch (error) {
      console.error('Error toggling search active:', error);
      return false;
    }
  }

  async getFavorites(): Promise<Apartment[]> {
    try {
      const result = await api.getFavorites();
      return result.data.map(mapApiFavoriteToApartment);
    } catch (error) {
      console.error('Error fetching favorites:', error);
      return [];
    }
  }

  async addFavorite(_apartment: Omit<Apartment, 'id' | 'user_id' | 'created_at'>): Promise<Apartment | null> {
    // This method is kept for compatibility but might need apartment ID from our DB
    console.warn('addFavorite: This method requires an apartment ID from our database');
    return null;
  }

  async removeFavorite(id: string): Promise<boolean> {
    try {
      await api.removeFavorite(id);
      return true;
    } catch (error) {
      console.error('Error removing favorite:', error);
      return false;
    }
  }
}
