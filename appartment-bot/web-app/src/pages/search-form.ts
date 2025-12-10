import { UKRAINIAN_CITIES, ROOM_OPTIONS, SearchFormData } from '../types';
import { i18n } from '../i18n';

export class SearchFormPage {
  private container: HTMLElement;
  private formData: SearchFormData = {
    city: UKRAINIAN_CITIES[0],
    property_type: 'rent',
    price_min: 0,
    price_max: null,
    currency: i18n.getCurrency(),
    rooms: [],
    area_min: 0,
    area_max: null,
    apartment_type: 'flat',
    without_realtors: false,
    pets_friendly: false,
    floor_min: 1,
    floor_max: null
  };
  private editingId: string | null = null;
  private onSave?: (data: SearchFormData, id?: string) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  setOnSave(callback: (data: SearchFormData, id?: string) => void) {
    this.onSave = callback;
  }

  setFormData(data: Partial<SearchFormData>, id?: string) {
    this.formData = { ...this.formData, ...data };
    this.editingId = id || null;
    this.render();
  }

  resetForm() {
    this.formData = {
      city: UKRAINIAN_CITIES[0],
      property_type: 'rent',
      price_min: 0,
      price_max: null,
      currency: i18n.getCurrency(),
      rooms: [],
      area_min: 0,
      area_max: null,
      apartment_type: 'flat',
      without_realtors: false,
      pets_friendly: false,
      floor_min: 1,
      floor_max: null
    };
    this.editingId = null;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <h1 class="page-title">${this.editingId ? i18n.t('editSearch') : i18n.t('newSearch')}</h1>

      <form id="searchForm">
        <div class="form-group">
          <label class="form-label">${i18n.t('city')}</label>
          <select class="form-select" id="city">
            ${UKRAINIAN_CITIES.map(city =>
              `<option value="${city}" ${this.formData.city === city ? 'selected' : ''}>${city}</option>`
            ).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.t('propertyType')}</label>
          <div class="toggle-group">
            <button type="button" class="toggle-btn ${this.formData.property_type === 'rent' ? 'active' : ''}" data-type="rent">
              ${i18n.t('rent')}
            </button>
            <button type="button" class="toggle-btn ${this.formData.property_type === 'buy' ? 'active' : ''}" data-type="buy">
              ${i18n.t('buy')}
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.t('apartmentType')}</label>
          <div class="toggle-group">
            <button type="button" class="toggle-btn ${this.formData.apartment_type === 'flat' ? 'active' : ''}" data-apartment-type="flat">
              ${i18n.t('flat')}
            </button>
            <button type="button" class="toggle-btn ${this.formData.apartment_type === 'house' ? 'active' : ''}" data-apartment-type="house">
              ${i18n.t('house')}
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.t('price')} (${i18n.getCurrency()})</label>
          <div class="input-row">
            <input
              type="number"
              class="form-input"
              id="priceMin"
              placeholder="${i18n.t('from')}"
              value="${this.formData.price_min || ''}"
              min="0"
            >
            <input
              type="number"
              class="form-input"
              id="priceMax"
              placeholder="${i18n.t('to')}"
              value="${this.formData.price_max || ''}"
              min="0"
            >
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.t('rooms')}</label>
          <div class="room-selector">
            ${ROOM_OPTIONS.map(room => `
              <button
                type="button"
                class="room-btn ${this.formData.rooms.includes(room) ? 'active' : ''}"
                data-room="${room}"
              >
                ${room}${room === 4 ? '+' : ''}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.t('area')} (м²)</label>
          <div class="input-row">
            <input
              type="number"
              class="form-input"
              id="areaMin"
              placeholder="${i18n.t('from')}"
              value="${this.formData.area_min || ''}"
              min="0"
            >
            <input
              type="number"
              class="form-input"
              id="areaMax"
              placeholder="${i18n.t('to')}"
              value="${this.formData.area_max || ''}"
              min="0"
            >
          </div>
        </div>

        ${this.formData.apartment_type === 'flat' ? `
          <div class="form-group floor-filter">
            <label class="form-label">${i18n.t('floor')}</label>
            <div class="input-row">
              <input
                type="number"
                class="form-input"
                id="floorMin"
                placeholder="${i18n.t('from')}"
                value="${this.formData.floor_min || ''}"
                min="1"
              >
              <input
                type="number"
                class="form-input"
                id="floorMax"
                placeholder="${i18n.t('to')}"
                value="${this.formData.floor_max || ''}"
                min="1"
              >
            </div>
          </div>
        ` : ''}

        <div class="form-group checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="withoutRealtors" ${this.formData.without_realtors ? 'checked' : ''}>
            <span class="checkbox-custom"></span>
            <span class="checkbox-text">${i18n.t('withoutRealtors')}</span>
          </label>
        </div>

        <div class="form-group checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="petsFriendly" ${this.formData.pets_friendly ? 'checked' : ''}>
            <span class="checkbox-custom"></span>
            <span class="checkbox-text">
              ${i18n.t('petsFriendly')}
              <span class="pet-icon">🐾</span>
            </span>
          </label>
        </div>

        <button type="submit" class="btn-primary">
          ${this.editingId ? i18n.t('saveChanges') : i18n.t('saveSearch')}
        </button>
      </form>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners() {
    const form = this.container.querySelector('#searchForm') as HTMLFormElement;
    const citySelect = this.container.querySelector('#city') as HTMLSelectElement;
    const typeButtons = this.container.querySelectorAll('[data-type]');
    const roomButtons = this.container.querySelectorAll('[data-room]');
    const priceMinInput = this.container.querySelector('#priceMin') as HTMLInputElement;
    const priceMaxInput = this.container.querySelector('#priceMax') as HTMLInputElement;
    const areaMinInput = this.container.querySelector('#areaMin') as HTMLInputElement;
    const areaMaxInput = this.container.querySelector('#areaMax') as HTMLInputElement;
    const apartmentTypeButtons = this.container.querySelectorAll('[data-apartment-type]');
    const floorMinInput = this.container.querySelector('#floorMin') as HTMLInputElement | null;
    const floorMaxInput = this.container.querySelector('#floorMax') as HTMLInputElement | null;
    const withoutRealtorsCheckbox = this.container.querySelector('#withoutRealtors') as HTMLInputElement;
    const petsFriendlyCheckbox = this.container.querySelector('#petsFriendly') as HTMLInputElement;

    citySelect.addEventListener('change', () => {
      this.formData.city = citySelect.value;
    });

    typeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type') as 'rent' | 'buy';
        this.formData.property_type = type;
        typeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    roomButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const room = parseInt(btn.getAttribute('data-room')!);
        const index = this.formData.rooms.indexOf(room);

        if (index > -1) {
          this.formData.rooms.splice(index, 1);
          btn.classList.remove('active');
        } else {
          this.formData.rooms.push(room);
          btn.classList.add('active');
        }
      });
    });

    priceMinInput.addEventListener('input', () => {
      this.formData.price_min = parseInt(priceMinInput.value) || 0;
    });

    priceMaxInput.addEventListener('input', () => {
      this.formData.price_max = parseInt(priceMaxInput.value) || null;
    });

    areaMinInput.addEventListener('input', () => {
      this.formData.area_min = parseInt(areaMinInput.value) || 0;
    });

    areaMaxInput.addEventListener('input', () => {
      this.formData.area_max = parseInt(areaMaxInput.value) || null;
    });

    apartmentTypeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-apartment-type') as 'flat' | 'house';
        const floorFilter = this.container.querySelector('.floor-filter');

        if (this.formData.apartment_type === 'flat' && type === 'house' && floorFilter) {
          floorFilter.classList.add('floor-filter-exit');
          setTimeout(() => {
            this.formData.apartment_type = type;
            apartmentTypeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.render();
          }, 300);
        } else {
          this.formData.apartment_type = type;
          apartmentTypeButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.render();
        }
      });
    });

    if (floorMinInput) {
      floorMinInput.addEventListener('input', () => {
        this.formData.floor_min = parseInt(floorMinInput.value) || 1;
      });
    }

    if (floorMaxInput) {
      floorMaxInput.addEventListener('input', () => {
        this.formData.floor_max = parseInt(floorMaxInput.value) || null;
      });
    }

    withoutRealtorsCheckbox.addEventListener('change', () => {
      this.formData.without_realtors = withoutRealtorsCheckbox.checked;
    });

    petsFriendlyCheckbox.addEventListener('change', () => {
      this.formData.pets_friendly = petsFriendlyCheckbox.checked;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      if (this.onSave) {
        this.onSave(this.formData, this.editingId || undefined);
      }
    });
  }
}
