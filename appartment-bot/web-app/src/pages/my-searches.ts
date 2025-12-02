import { Search } from '../types';
import { i18n } from '../i18n';

export class MySearchesPage {
  private container: HTMLElement;
  private searches: Search[] = [];
  private onEdit?: (search: Search) => void;
  private onDelete?: (id: string) => void;
  private onToggleActive?: (id: string, isActive: boolean) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  setSearches(searches: Search[]) {
    this.searches = searches;
    this.render();
  }

  setOnEdit(callback: (search: Search) => void) {
    this.onEdit = callback;
  }

  setOnDelete(callback: (id: string) => void) {
    this.onDelete = callback;
  }

  setOnToggleActive(callback: (id: string, isActive: boolean) => void) {
    this.onToggleActive = callback;
  }

  render() {
    if (this.searches.length === 0) {
      this.container.innerHTML = `
        <h1 class="page-title">${i18n.t('mySearches')}</h1>
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">${i18n.t('noSearches')}</div>
          <div class="empty-text">${i18n.t('noSearchesText')}</div>
        </div>
      `;
      return;
    }

    const searchCards = this.searches.map(search => this.createSearchCard(search)).join('');

    this.container.innerHTML = `
      <h1 class="page-title">${i18n.t('mySearches')}</h1>
      <div id="searchesList">${searchCards}</div>
    `;

    this.attachEventListeners();
  }

  private getCityImageUrl(city: string): string {
    const cityImages: Record<string, string> = {
      'Київ': 'https://images.pexels.com/photos/1802255/pexels-photo-1802255.jpeg?auto=compress&cs=tinysrgb&w=400',
      'Одеса': 'https://images.pexels.com/photos/1802255/pexels-photo-1802255.jpeg?auto=compress&cs=tinysrgb&w=400',
      'Харків': 'https://images.pexels.com/photos/208701/pexels-photo-208701.jpeg?auto=compress&cs=tinysrgb&w=400',
      'Львів': 'https://images.pexels.com/photos/161771/prague-czech-republic-city-architecture-161771.jpeg?auto=compress&cs=tinysrgb&w=400',
      'Дніпро': 'https://images.pexels.com/photos/374710/pexels-photo-374710.jpeg?auto=compress&cs=tinysrgb&w=400'
    };
    return cityImages[city] || 'https://images.pexels.com/photos/1802255/pexels-photo-1802255.jpeg?auto=compress&cs=tinysrgb&w=400';
  }

  private createSearchCard(search: Search): string {
    const currency = i18n.getCurrencySymbol();
    const priceRange = search.price_max
      ? `${currency}${search.price_min} - ${currency}${search.price_max}`
      : `${i18n.t('from')} ${currency}${search.price_min}`;

    const roomsText = search.rooms.length > 0
      ? search.rooms.map(r => r === 4 ? '4+' : r).join(', ') + (i18n.getLanguage() === 'uk' ? ' кімн.' : ' rm.')
      : i18n.t('anyRooms');

    const areaRange = search.area_max
      ? `${search.area_min} - ${search.area_max} м²`
      : search.area_min > 0
      ? `${i18n.t('from')} ${search.area_min} м²`
      : i18n.t('anyArea');

    const cityImageUrl = this.getCityImageUrl(search.city);

    return `
      <div class="card search-card" data-search-id="${search.id}">
        <div class="city-image-bg" style="background-image: url('${cityImageUrl}');"></div>
        <div class="card-content">
          <div class="card-header">
            <div>
              <div class="card-title">${search.city}</div>
              <div class="card-subtitle">
                ${search.property_type === 'rent' ? i18n.t('rent') : i18n.t('buy')}
                ${search.is_active ? `<span class="badge">${i18n.t('active')}</span>` : `<span class="badge inactive">${i18n.t('inactive')}</span>`}
              </div>
            </div>
          </div>

          <div class="card-details">
            💰 ${priceRange}<br>
            🏠 ${roomsText}<br>
            📐 ${areaRange}
          </div>

          <div class="card-actions">
            <button class="btn-icon edit-btn" data-id="${search.id}">✏️ ${i18n.t('edit')}</button>
            <button class="btn-icon danger delete-btn" data-id="${search.id}">🗑️ ${i18n.t('delete')}</button>
          </div>

          <div class="toggle-switch">
            <label class="switch">
              <input type="checkbox" class="toggle-checkbox" data-id="${search.id}" ${search.is_active ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <span>${i18n.t('notifications')}</span>
          </div>
        </div>
      </div>
    `;
  }

  private attachEventListeners() {
    const editButtons = this.container.querySelectorAll('.edit-btn');
    const deleteButtons = this.container.querySelectorAll('.delete-btn');
    const toggleCheckboxes = this.container.querySelectorAll('.toggle-checkbox');

    editButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const search = this.searches.find(s => s.id === id);
        if (search && this.onEdit) {
          this.onEdit(search);
        }
      });
    });

    deleteButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id && confirm(i18n.t('confirmDelete'))) {
          if (this.onDelete) {
            this.onDelete(id);
          }
        }
      });
    });

    toggleCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const id = target.getAttribute('data-id');
        if (id && this.onToggleActive) {
          this.onToggleActive(id, target.checked);
        }
      });
    });
  }
}
