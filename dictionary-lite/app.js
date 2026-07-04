'use strict';

const DATA_URLS = {
  'ms-ru': './data/ms-ru.json',
  'ru-ms': './data/ru-ms.json',
};
const DIRECTION_LABELS = {
  'ms-ru': 'Малайский → Русский',
  'ru-ms': 'Русский → Малайский',
};
const STORAGE_DIRECTION = 'malay-dictionary-lite:direction';
const STORAGE_THEME = 'malay-dictionary-lite:theme';
const DEBOUNCE_MS = 140;

const ui = {
  search: document.getElementById('search'),
  clear: document.getElementById('clearSearch'),
  swap: document.getElementById('swapDirection'),
  theme: document.getElementById('themeToggle'),
  status: document.getElementById('status'),
  resultCount: document.getElementById('resultCount'),
  results: document.getElementById('results'),
  directionButtons: [...document.querySelectorAll('[data-direction]')],
};

const state = {
  direction: localStorage.getItem(STORAGE_DIRECTION) || 'ms-ru',
  data: new Map(),
  loading: new Map(),
  lastQuery: '',
  token: 0,
  debounceId: 0,
};

function setTheme(theme) {
  const value = theme === 'dark' || theme === 'light' ? theme : '';
  document.documentElement.dataset.theme = value;
  if (value) {
    localStorage.setItem(STORAGE_THEME, value);
  } else {
    localStorage.removeItem(STORAGE_THEME);
  }
  ui.theme.textContent = value === 'dark' ? 'Светлая тема' : 'Тёмная тема';
}

function initTheme() {
  setTheme(localStorage.getItem(STORAGE_THEME) || '');
}

function setStatus(message) {
  ui.status.textContent = message;
}

function setDirection(direction, rerun = true) {
  state.direction = direction;
  localStorage.setItem(STORAGE_DIRECTION, direction);
  ui.directionButtons.forEach((button) => {
    const active = button.dataset.direction === direction;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  ui.search.placeholder = direction === 'ru-ms' ? 'Введите русское слово' : 'Введите малайское слово';
  state.lastQuery = '';
  if (rerun) {
    void runSearch();
  }
}

async function loadDirection(direction) {
  if (state.data.has(direction)) {
    return state.data.get(direction);
  }
  if (state.loading.has(direction)) {
    return state.loading.get(direction);
  }

  const task = (async () => {
    setStatus(`Загрузка базы: ${DIRECTION_LABELS[direction]}...`);
    const response = await fetch(DATA_URLS[direction], { cache: 'default' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const rawEntries = Array.isArray(payload) ? payload : payload.entries || [];
    const entries = DictionaryLiteSearch.prepareEntries(rawEntries, direction);
    state.data.set(direction, entries);
    return entries;
  })();

  state.loading.set(direction, task);
  try {
    return await task;
  } finally {
    state.loading.delete(direction);
  }
}

function createHighlightedText(text, query, direction) {
  const fragment = document.createDocumentFragment();
  const source = String(text || '');
  const normalizedSource = DictionaryLiteSearch.normalizeText(source, direction);
  const normalizedQuery = DictionaryLiteSearch.normalizeText(query, direction);
  const index = normalizedQuery ? normalizedSource.indexOf(normalizedQuery) : -1;

  if (index < 0) {
    fragment.append(document.createTextNode(source));
    return fragment;
  }

  fragment.append(document.createTextNode(source.slice(0, index)));
  const mark = document.createElement('mark');
  mark.textContent = source.slice(index, index + normalizedQuery.length);
  fragment.append(mark, document.createTextNode(source.slice(index + normalizedQuery.length)));
  return fragment;
}

function renderResults(items, total, query) {
  ui.results.replaceChildren();
  ui.resultCount.textContent = total ? `Найдено: ${total}. Показано: ${items.length}.` : 'Совпадений нет.';

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = query.length < 2 ? 'Введите минимум 2 символа.' : 'Нет результатов. Попробуйте другое написание.';
    ui.results.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'result-card';
    li.tabIndex = 0;

    const title = document.createElement('h2');
    title.append(createHighlightedText(item.title, query, state.direction));

    const body = document.createElement('p');
    body.append(createHighlightedText(item.body, query, state.direction));

    li.append(title, body);
    fragment.append(li);
  }
  ui.results.append(fragment);
}

async function runSearch() {
  const query = ui.search.value.trim().replace(/\s+/g, ' ');
  const token = ++state.token;

  if (query === state.lastQuery && state.data.has(state.direction)) {
    return;
  }
  state.lastQuery = query;

  if (query.length < 2) {
    renderResults([], 0, query);
    setStatus(`Готово. Выбрано направление: ${DIRECTION_LABELS[state.direction]}.`);
    return;
  }

  try {
    const entries = await loadDirection(state.direction);
    if (token !== state.token) return;
    const found = DictionaryLiteSearch.searchEntries(entries, query, state.direction);
    renderResults(found.results, found.total, query);
    setStatus(`База загружена: ${entries.length} статей. Поиск работает офлайн после первого открытия.`);
    warmOtherDirection();
  } catch (error) {
    if (token !== state.token) return;
    renderResults([], 0, query);
    setStatus(`Не удалось загрузить словарь: ${error.message}. Запустите через локальный сервер, не через file://.`);
  }
}

function warmOtherDirection() {
  const other = state.direction === 'ms-ru' ? 'ru-ms' : 'ms-ru';
  if (!state.data.has(other) && !state.loading.has(other)) {
    window.setTimeout(() => loadDirection(other).catch(() => {}), 300);
  }
}

function scheduleSearch() {
  window.clearTimeout(state.debounceId);
  state.debounceId = window.setTimeout(runSearch, DEBOUNCE_MS);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      setStatus('Service Worker недоступен, но словарь продолжит работать через обычную загрузку.');
    });
  });
}

ui.search.addEventListener('input', scheduleSearch);
ui.search.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    ui.search.value = '';
    state.lastQuery = '';
    renderResults([], 0, '');
    setStatus('Поиск очищен.');
  }
});
ui.clear.addEventListener('click', () => {
  ui.search.value = '';
  state.lastQuery = '';
  renderResults([], 0, '');
  setStatus('Поиск очищен.');
  ui.search.focus();
});
ui.swap.addEventListener('click', () => {
  setDirection(state.direction === 'ms-ru' ? 'ru-ms' : 'ms-ru');
  ui.search.focus();
});
ui.directionButtons.forEach((button) => {
  button.addEventListener('click', () => setDirection(button.dataset.direction));
});
ui.theme.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  setTheme(current === 'dark' ? 'light' : 'dark');
});

initTheme();
setDirection(state.direction, false);
renderResults([], 0, '');
void loadDirection(state.direction)
  .then((entries) => setStatus(`Готово: ${entries.length} статей. Начните вводить слово.`))
  .catch((error) => setStatus(`Ошибка загрузки: ${error.message}. Открывайте через локальный сервер.`));
registerServiceWorker();
