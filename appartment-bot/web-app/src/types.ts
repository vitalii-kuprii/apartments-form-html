export interface Search {
  id: string;
  user_id: string;
  city: string;
  property_type: 'rent' | 'buy';
  price_min: number;
  price_max: number | null;
  rooms: number[];
  area_min: number;
  area_max: number | null;
  apartment_type: 'flat' | 'house';
  without_realtors: boolean;
  pets_friendly: boolean;
  floor_min: number;
  floor_max: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SearchFormData {
  city: string;
  property_type: 'rent' | 'buy';
  price_min: number;
  price_max: number | null;
  rooms: number[];
  area_min: number;
  area_max: number | null;
  apartment_type: 'flat' | 'house';
  without_realtors: boolean;
  pets_friendly: boolean;
  floor_min: number;
  floor_max: number | null;
}

export interface Apartment {
  id: string;
  user_id: string;
  external_id: string;
  photo_url: string | null;
  price: number;
  rooms: number;
  area: number;
  address: string;
  listing_url: string;
  created_at: string;
}

export const UKRAINIAN_CITIES = [
  'Київ',
  'Одеса',
  'Харків',
  'Львів',
  'Дніпро',
  'Запоріжжя',
  'Вінниця',
  'Полтава',
  'Черкаси',
  'Житомир',
  'Тернопіль',
  'Івано-Франківськ',
  'Луцьк',
  'Рівне',
  'Хмельницький',
  'Чернівці',
  'Суми',
  'Чернігів',
  'Кропивницький',
  'Миколаїв'
] as const;

export const ROOM_OPTIONS = [1, 2, 3, 4] as const;
