export type Language = 'uk' | 'en';
export type Currency = 'UAH' | 'USD' | 'EUR';

export const translations = {
  uk: {
    newSearch: 'Новий пошук',
    editSearch: 'Редагувати пошук',
    mySearches: 'Мої пошуки',
    favorites: 'Обрані',
    search: 'Пошук',
    city: 'Місто',
    propertyType: 'Тип нерухомості',
    rent: 'Оренда',
    buy: 'Купівля',
    price: 'Ціна',
    from: 'Від',
    to: 'До',
    rooms: 'Кількість кімнат',
    area: 'Площа',
    saveSearch: 'Зберегти пошук',
    saveChanges: 'Зберегти зміни',
    noSearches: 'Ще немає збережених пошуків',
    noSearchesText: 'Створіть перший пошук, щоб отримувати сповіщення про нові квартири',
    noFavorites: 'Ще немає обраних квартир',
    noFavoritesText: 'Додавайте цікаві квартири зі сповіщень до обраних',
    edit: 'Редагувати',
    delete: 'Видалити',
    view: 'Переглянути',
    active: 'Активний',
    inactive: 'Неактивний',
    notifications: 'Отримувати сповіщення',
    confirmDelete: 'Ви впевнені, що хочете видалити цей пошук?',
    confirmRemove: 'Видалити з обраних?',
    anyRooms: 'Будь-яка кількість кімнат',
    anyArea: 'Будь-яка площа',
    apartmentType: 'Тип житла',
    flat: 'Квартира',
    house: 'Будинок',
    withoutRealtors: 'Без ріелторів',
    petsFriendly: 'Можна з тваринами',
    floor: 'Поверх'
  },
  en: {
    newSearch: 'New Search',
    editSearch: 'Edit Search',
    mySearches: 'My Searches',
    favorites: 'Favorites',
    search: 'Search',
    city: 'City',
    propertyType: 'Property Type',
    rent: 'Rent',
    buy: 'Buy',
    price: 'Price',
    from: 'From',
    to: 'To',
    rooms: 'Rooms',
    area: 'Area',
    saveSearch: 'Save Search',
    saveChanges: 'Save Changes',
    noSearches: 'No saved searches yet',
    noSearchesText: 'Create your first search to receive notifications about new apartments',
    noFavorites: 'No favorite apartments yet',
    noFavoritesText: 'Add interesting apartments from notifications to favorites',
    edit: 'Edit',
    delete: 'Delete',
    view: 'View',
    active: 'Active',
    inactive: 'Inactive',
    notifications: 'Receive notifications',
    confirmDelete: 'Are you sure you want to delete this search?',
    confirmRemove: 'Remove from favorites?',
    anyRooms: 'Any number of rooms',
    anyArea: 'Any area',
    apartmentType: 'Apartment Type',
    flat: 'Flat',
    house: 'House',
    withoutRealtors: 'Without realtors',
    petsFriendly: 'Pets friendly',
    floor: 'Floor'
  }
};

export const currencySymbols: Record<Currency, string> = {
  UAH: '₴',
  USD: '$',
  EUR: '€'
};

export class I18n {
  private currentLanguage: Language = 'uk';
  private currentCurrency: Currency = 'UAH';

  constructor() {
    const savedLang = localStorage.getItem('language') as Language;
    const savedCurrency = localStorage.getItem('currency') as Currency;

    if (savedLang && (savedLang === 'uk' || savedLang === 'en')) {
      this.currentLanguage = savedLang;
    }

    if (savedCurrency && (savedCurrency === 'UAH' || savedCurrency === 'USD' || savedCurrency === 'EUR')) {
      this.currentCurrency = savedCurrency;
    }
  }

  setLanguage(lang: Language) {
    this.currentLanguage = lang;
    localStorage.setItem('language', lang);
  }

  getLanguage(): Language {
    return this.currentLanguage;
  }

  setCurrency(currency: Currency) {
    this.currentCurrency = currency;
    localStorage.setItem('currency', currency);
  }

  getCurrency(): Currency {
    return this.currentCurrency;
  }

  getCurrencySymbol(): string {
    return currencySymbols[this.currentCurrency];
  }

  t(key: keyof typeof translations.uk): string {
    return translations[this.currentLanguage][key];
  }
}

export const i18n = new I18n();
