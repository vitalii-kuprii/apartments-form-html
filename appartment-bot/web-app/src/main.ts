import './style.css';
import { Router } from './router';
import { SearchFormPage } from './pages/search-form';
import { MySearchesPage } from './pages/my-searches';
import { FavoritesPage } from './pages/favorites';
import { DataService } from './services/data-service';
import { Search, SearchFormData } from './types';
import { i18n, Language, Currency } from './i18n';

const dataService = new DataService();
const router = new Router();

// Initialize on app start (authenticate with API)
dataService.initialize().then((success) => {
  if (!success) {
    console.warn('Failed to authenticate with API - some features may not work');
  }
});

function updateUILanguage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n') as keyof typeof import('./i18n').translations.uk;
    if (key) {
      el.textContent = i18n.t(key);
    }
  });

  const currentLanguageEl = document.getElementById('currentLanguage');
  if (currentLanguageEl) {
    currentLanguageEl.textContent = i18n.getLanguage() === 'uk' ? '🇺🇦 UA' : '🇬🇧 EN';
  }

  const currentCurrencyEl = document.getElementById('currentCurrency');
  if (currentCurrencyEl) {
    currentCurrencyEl.textContent = i18n.getCurrency();
  }

  searchFormPage.render();
  if (router.getCurrentRoute() === '/searches') {
    loadSearches();
  }
  if (router.getCurrentRoute() === '/favorites') {
    loadFavorites();
  }
}

function initializeSelectors() {
  const languageSelector = document.getElementById('languageSelector');
  const languageDropdown = document.getElementById('languageDropdown');
  const currencySelector = document.getElementById('currencySelector');
  const currencyDropdown = document.getElementById('currencyDropdown');

  languageSelector?.addEventListener('click', (e) => {
    e.stopPropagation();
    languageDropdown?.classList.toggle('active');
    currencyDropdown?.classList.remove('active');
  });

  currencySelector?.addEventListener('click', (e) => {
    e.stopPropagation();
    currencyDropdown?.classList.toggle('active');
    languageDropdown?.classList.remove('active');
  });

  document.addEventListener('click', () => {
    languageDropdown?.classList.remove('active');
    currencyDropdown?.classList.remove('active');
  });

  document.querySelectorAll('[data-lang]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang') as Language;
      i18n.setLanguage(lang);
      updateUILanguage();
      languageDropdown?.classList.remove('active');
    });
  });

  document.querySelectorAll('[data-currency]').forEach(btn => {
    btn.addEventListener('click', () => {
      const currency = btn.getAttribute('data-currency') as Currency;
      i18n.setCurrency(currency);
      updateUILanguage();
      currencyDropdown?.classList.remove('active');
    });
  });

  updateUILanguage();
}

const searchFormContainer = document.getElementById('searchFormPage')!;
const mySearchesContainer = document.getElementById('mySearchesPage')!;
const favoritesContainer = document.getElementById('favoritesPage')!;

const searchFormPage = new SearchFormPage(searchFormContainer);
const mySearchesPage = new MySearchesPage(mySearchesContainer);
const favoritesPage = new FavoritesPage(favoritesContainer);

async function loadSearches() {
  const searches = await dataService.getSearches();
  mySearchesPage.setSearches(searches);
}

async function loadFavorites() {
  const favorites = await dataService.getFavorites();
  favoritesPage.setFavorites(favorites);
}

searchFormPage.setOnSave(async (formData: SearchFormData, id?: string) => {
  if (id) {
    const updated = await dataService.updateSearch(id, formData);
    if (updated) {
      searchFormPage.resetForm();
      router.navigate('/searches');
      await loadSearches();
    }
  } else {
    const created = await dataService.createSearch(formData);
    if (created) {
      searchFormPage.resetForm();
      router.navigate('/searches');
      await loadSearches();
    }
  }
});

mySearchesPage.setOnEdit((search: Search) => {
  searchFormPage.setFormData({
    city: search.city,
    property_type: search.property_type,
    price_min: search.price_min,
    price_max: search.price_max,
    rooms: search.rooms,
    area_min: search.area_min,
    area_max: search.area_max,
    apartment_type: search.apartment_type,
    without_realtors: search.without_realtors,
    pets_friendly: search.pets_friendly,
    floor_min: search.floor_min,
    floor_max: search.floor_max
  }, search.id);
  router.navigate('/');
});

mySearchesPage.setOnDelete(async (id: string) => {
  const success = await dataService.deleteSearch(id);
  if (success) {
    await loadSearches();
  }
});

mySearchesPage.setOnToggleActive(async (id: string, isActive: boolean) => {
  await dataService.toggleSearchActive(id, isActive);
  await loadSearches();
});

favoritesPage.setOnRemove(async (id: string) => {
  const success = await dataService.removeFavorite(id);
  if (success) {
    await loadFavorites();
  }
});

router.addRoute('/', () => {
  searchFormPage.render();
});

router.addRoute('/searches', async () => {
  await loadSearches();
});

router.addRoute('/favorites', async () => {
  await loadFavorites();
});

initializeSelectors();

// Check URL parameters for initial route (for Telegram WebApp deep linking)
const urlParams = new URLSearchParams(window.location.search);
const startParam = urlParams.get('startapp') || urlParams.get('page');
if (startParam === 'searches') {
  router.navigate('/searches');
} else if (startParam === 'favorites') {
  router.navigate('/favorites');
} else {
  searchFormPage.render();
}
