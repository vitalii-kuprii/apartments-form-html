import { Apartment } from '../types';
import { i18n } from '../i18n';

export class FavoritesPage {
  private container: HTMLElement;
  private favorites: Apartment[] = [];
  private onRemove?: (id: string) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  setFavorites(favorites: Apartment[]) {
    this.favorites = favorites;
    this.render();
  }

  setOnRemove(callback: (id: string) => void) {
    this.onRemove = callback;
  }

  render() {
    if (this.favorites.length === 0) {
      this.container.innerHTML = `
        <h1 class="page-title">${i18n.t('favorites')}</h1>
        <div class="empty-state">
          <div class="empty-icon">⭐</div>
          <div class="empty-title">${i18n.t('noFavorites')}</div>
          <div class="empty-text">${i18n.t('noFavoritesText')}</div>
        </div>
      `;
      return;
    }

    const apartmentCards = this.favorites.map(apt => this.createApartmentCard(apt)).join('');

    this.container.innerHTML = `
      <h1 class="page-title">${i18n.t('favorites')}</h1>
      <div id="favoritesList">${apartmentCards}</div>
    `;

    this.attachEventListeners();
  }

  private createApartmentCard(apartment: Apartment): string {
    const currency = i18n.getCurrencySymbol();
    const roomLabel = i18n.getLanguage() === 'uk' ? 'кімн.' : 'rm.';
    return `
      <div class="apartment-card" data-apt-id="${apartment.id}">
        ${apartment.photo_url
          ? `<img src="${apartment.photo_url}" alt="Квартира" class="apartment-image">`
          : '<div class="apartment-image"></div>'
        }
        <div class="apartment-info">
          <div class="apartment-price">${currency}${apartment.price.toLocaleString()}</div>
          <div class="apartment-details">
            <span>🏠 ${apartment.rooms} ${roomLabel}</span>
            <span>📐 ${apartment.area} м²</span>
          </div>
          <div class="apartment-address">${apartment.address}</div>
          <div class="card-actions">
            <button class="btn-icon" data-url="${apartment.listing_url}">🔗 ${i18n.t('view')}</button>
            <button class="btn-icon danger remove-btn" data-id="${apartment.id}">🗑️ ${i18n.t('delete')}</button>
          </div>
        </div>
      </div>
    `;
  }

  private attachEventListeners() {
    const viewButtons = this.container.querySelectorAll('[data-url]');
    const removeButtons = this.container.querySelectorAll('.remove-btn');

    viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        if (url) {
          window.open(url, '_blank');
        }
      });
    });

    removeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (id && confirm(i18n.t('confirmRemove'))) {
          if (this.onRemove) {
            this.onRemove(id);
          }
        }
      });
    });
  }
}
