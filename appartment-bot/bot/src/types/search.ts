export interface SearchFormData {
  city: string;
  property_type: 'rent' | 'buy';
  apartment_type: 'flat' | 'house';
  price_min: number;
  price_max: number | null;
  rooms: number[];
  area_min: number;
  area_max: number | null;
  floor_min: number;
  floor_max: number | null;
  without_realtors: boolean;
  pets_friendly: boolean;
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

export const PRICE_PRESETS_RENT = [
  { label: 'до 5 000 ₴', min: 0, max: 5000 },
  { label: '5 000 - 10 000 ₴', min: 5000, max: 10000 },
  { label: '10 000 - 15 000 ₴', min: 10000, max: 15000 },
  { label: '15 000 - 25 000 ₴', min: 15000, max: 25000 },
  { label: '25 000+ ₴', min: 25000, max: null },
] as const;

export const PRICE_PRESETS_BUY = [
  { label: 'до 500 000 $', min: 0, max: 500000 },
  { label: '500 000 - 1 000 000 $', min: 500000, max: 1000000 },
  { label: '1 000 000 - 2 000 000 $', min: 1000000, max: 2000000 },
  { label: '2 000 000+ $', min: 2000000, max: null },
] as const;

export function getDefaultSearchData(): SearchFormData {
  return {
    city: UKRAINIAN_CITIES[0],
    property_type: 'rent',
    apartment_type: 'flat',
    price_min: 0,
    price_max: null,
    rooms: [],
    area_min: 0,
    area_max: null,
    floor_min: 1,
    floor_max: null,
    without_realtors: false,
    pets_friendly: false,
  };
}
