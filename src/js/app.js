// File: src/js/app.js

document.addEventListener('DOMContentLoaded', () => {
  // 1) Вбудовані переклади
  const translations = {
    uk: {
      title: 'Пошук нерухомості',
      languageLabel: 'Мова',
      labelCity: 'Місто',
      placeholderCity: 'Введіть місто',
      labelType: 'Тип нерухомості',
      optionSelect: 'Оберіть…',
      optionHouse: 'Будинок',
      optionApartment: 'Квартира',
      labelRooms: 'Кількість кімнат',
      labelAreaFrom: 'Площа від (м²)',
      placeholderAreaFrom: 'Мін',
      labelAreaTo: 'Площа до (м²)',
      placeholderAreaTo: 'Макс',
      labelPriceFrom: 'Ціна від (₴)',
      placeholderPriceFrom: 'Мін',
      labelPriceTo: 'Ціна до (₴)',
      placeholderPriceTo: 'Макс',
      buttonSearch: 'Пошук',
      errorRequired: {
        city: 'Будь ласка, введіть місто',
        type: 'Оберіть тип нерухомості',
        rooms: 'Оберіть кількість кімнат',
        'area-min': 'Вкажіть мінімальну площу',
        'area-max': 'Вкажіть максимальну площу',
        'price-min': 'Вкажіть мінімальну ціну',
        'price-max': 'Вкажіть максимальну ціну',
      },
      errorMinMax: {
        Площа: 'Поле ‘Площа до’ не може бути меншим за ‘Площа від’',
        Ціна: 'Поле ‘Ціна до’ не може бути меншим за ‘Ціна від’',
      },
    },
    en: {
      title: 'Apartment Search',
      languageLabel: 'Language',
      labelCity: 'City',
      placeholderCity: 'Enter city',
      labelType: 'Property Type',
      optionSelect: 'Select…',
      optionHouse: 'House',
      optionApartment: 'Apartment',
      labelRooms: 'Rooms',
      labelAreaFrom: 'Area from (m²)',
      placeholderAreaFrom: 'Min',
      labelAreaTo: 'Area to (m²)',
      placeholderAreaTo: 'Max',
      labelPriceFrom: 'Price from (₴)',
      placeholderPriceFrom: 'Min',
      labelPriceTo: 'Price to (₴)',
      placeholderPriceTo: 'Max',
      buttonSearch: 'Search',
      errorRequired: {
        city: 'Please enter a city',
        type: 'Please select a property type',
        rooms: 'Please select number of rooms',
        'area-min': 'Please enter minimum area',
        'area-max': 'Please enter maximum area',
        'price-min': 'Please enter minimum price',
        'price-max': 'Please enter maximum price',
      },
      errorMinMax: {
        Площа: 'Field ‘Area to’ cannot be less than ‘Area from’',
        Ціна: 'Field ‘Price to’ cannot be less than ‘Price from’',
      },
    },
    pl: {
      title: 'Szukaj nieruchomości',
      languageLabel: 'Język',
      labelCity: 'Miasto',
      placeholderCity: 'Wpisz miasto',
      labelType: 'Typ nieruchomości',
      optionSelect: 'Wybierz…',
      optionHouse: 'Dom',
      optionApartment: 'Mieszkanie',
      labelRooms: 'Liczba pokoi',
      labelAreaFrom: 'Powierzchnia od (m²)',
      placeholderAreaFrom: 'Min',
      labelAreaTo: 'Powierzchnia do (m²)',
      placeholderAreaTo: 'Max',
      labelPriceFrom: 'Cena od (₴)',
      placeholderPriceFrom: 'Min',
      labelPriceTo: 'Cena do (₴)',
      placeholderPriceTo: 'Max',
      buttonSearch: 'Szukaj',
      errorRequired: {
        city: 'Proszę podać miasto',
        type: 'Wybierz typ nieruchomości',
        rooms: 'Wybierz liczbę pokoi',
        'area-min': 'Podaj minimalną powierzchnię',
        'area-max': 'Podaj maksymalną powierzchnię',
        'price-min': 'Podaj minimalną cenę',
        'price-max': 'Podaj maksymalną cenę',
      },
      errorMinMax: {
        Площа: 'Pole ‘Powierzchnia do’ nie może być mniejsze niż ‘Powierzchnia od’',
        Ціна: 'Pole ‘Cena do’ не може бути менше за ‘Cena od’',
      },
    },
  }

  // 2) Наразі збережена мова
  let currentLang = localStorage.getItem('lang') || 'uk'

  // 3) Функція застосування перекладу
  function applyTranslations() {
    const t = translations[currentLang]
    document.querySelector('.form-title').textContent = t.title
    document.querySelector('.lang-dropdown__toggle').setAttribute('aria-label', t.languageLabel)

    document.querySelector('label[for="city"]').textContent = t.labelCity
    city.placeholder = t.placeholderCity

    document.querySelector('label[for="type"]').textContent = t.labelType
    type.querySelector('option[value=""]').textContent = t.optionSelect
    type.querySelector('option[value="house"]').textContent = t.optionHouse
    type.querySelector('option[value="apartment"]').textContent = t.optionApartment

    document.querySelector('label[for="rooms"]').textContent = t.labelRooms
    rooms.querySelector('option[value=""]').textContent = t.optionSelect

    document.querySelector('label[for="area-min"]').textContent = t.labelAreaFrom
    areaMin.placeholder = t.placeholderAreaFrom
    document.querySelector('label[for="area-max"]').textContent = t.labelAreaTo
    areaMax.placeholder = t.placeholderAreaTo

    document.querySelector('label[for="price-min"]').textContent = t.labelPriceFrom
    priceMin.placeholder = t.placeholderPriceFrom
    document.querySelector('label[for="price-max"]').textContent = t.labelPriceTo
    priceMax.placeholder = t.placeholderPriceTo

    document.querySelector('button[type="submit"]').textContent = t.buttonSearch
  }

  // 4) Ініціалізуємо елементи
  const form = document.getElementById('search-form'),
    city = document.getElementById('city'),
    list = document.getElementById('city-suggestions'),
    type = document.getElementById('type'),
    rooms = document.getElementById('rooms'),
    areaMin = document.getElementById('area-min'),
    areaMax = document.getElementById('area-max'),
    priceMin = document.getElementById('price-min'),
    priceMax = document.getElementById('price-max'),
    dropdown = document.querySelector('.lang-dropdown'),
    toggle = dropdown.querySelector('.lang-dropdown__toggle'),
    menu = dropdown.querySelector('.lang-dropdown__menu'),
    items = dropdown.querySelectorAll('.lang-dropdown__item')

  // 5) Застосовуємо початковий переклад і прапорець
  applyTranslations()
  toggle.querySelector('.flag').textContent = dropdown
    .querySelector(`[data-lang="${currentLang}"]`)
    .querySelector('.flag').textContent

  // 6) Перемикач мов
  items.forEach((item) => {
    item.addEventListener('click', () => {
      currentLang = item.dataset.lang
      localStorage.setItem('lang', currentLang)
      toggle.querySelector('.flag').textContent = item.querySelector('.flag').textContent
      applyTranslations()
      menu.classList.remove('show')
    })
  })
  toggle.addEventListener('click', (e) => {
    e.stopPropagation()
    menu.classList.toggle('show')
  })
  document.addEventListener('click', () => menu.classList.remove('show'))

  // 7) Автокомпліт міста (як раніше)
  let cities = []
  try {
    cities = JSON.parse(document.getElementById('cities-data').textContent)
  } catch (e) {
    console.error(e)
  }

  city.addEventListener('input', () => {
    const val = city.value.trim().toLowerCase()
    list.innerHTML = ''
    if (!val) return list.classList.remove('show')
    const matches = cities.filter((c) => c.toLowerCase().startsWith(val))
    matches.slice(0, 10).forEach((c, i) => {
      const li = document.createElement('li')
      li.textContent = c
      li.setAttribute('role', 'option')
      li.id = `city-${i}`
      list.append(li)
    })
    list.classList.toggle('show', matches.length > 0)
  })
  list.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
      city.value = e.target.textContent
      list.classList.remove('show')
    }
  })
  city.addEventListener('blur', () =>
    setTimeout(() => {
      list.classList.remove('show')
    }, 100)
  )

  // 8) Валідація Min ≤ Max
  function validateMinMax(minEl, maxEl, label) {
    if (minEl.value && maxEl.value && +minEl.value > +maxEl.value) {
      maxEl.setCustomValidity(translations[currentLang].errorMinMax[label])
    } else {
      maxEl.setCustomValidity('')
    }
  }
  ;[areaMin, areaMax].forEach((el) =>
    el.addEventListener('input', () => validateMinMax(areaMin, areaMax, 'Площа'))
  )
  ;[priceMin, priceMax].forEach((el) =>
    el.addEventListener('input', () => validateMinMax(priceMin, priceMax, 'Ціна'))
  )

  // 9) Обробка помилок
  form.addEventListener(
    'invalid',
    (e) => {
      e.preventDefault()
      const el = e.target,
        id = el.id,
        t = translations[currentLang]
      let msg = el.validity.customError
        ? el.validationMessage
        : t.errorRequired[id] || t.errorRequired.city
      el.setCustomValidity(msg)
      const err = el.parentElement.querySelector('.error-message')
      if (err) {
        err.textContent = msg
        err.classList.add('active')
      }
    },
    true
  )

  form.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('input', () => {
      el.setCustomValidity('')
      const err = el.parentElement.querySelector('.error-message')
      if (err) {
        err.textContent = ''
        err.classList.remove('active')
      }
    })
  })

  form.addEventListener('submit', (e) => {
    validateMinMax(areaMin, areaMax, 'Площа')
    validateMinMax(priceMin, priceMax, 'Ціна')
    if (!form.checkValidity()) {
      e.preventDefault()
      form.classList.add('was-validated')
    }
  })
})
