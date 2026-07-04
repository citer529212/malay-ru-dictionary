# Малайско-русский словарь Lite

Lite-версия — это отдельная облегчённая офлайн-оболочка для простых Windows-ноутбуков. Она не заменяет полную онлайн-версию, а живёт в отдельной папке `dictionary-lite`.

## Чем отличается от полной версии

- Нет PDF-просмотра, загрузки сканов, страниц и масштабирования.
- Нет внешних шрифтов, CDN, PDF.js, фреймворков и серверной части.
- Интерфейс минимальный: поиск, очистка, направление перевода, результаты и тема.
- Данные подготовлены в компактном формате `['слово', 'перевод']`.
- После первого открытия через HTTP основные файлы кэшируются Service Worker и работают офлайн.

## Структура

```text
dictionary-lite/
├── index.html
├── style.css
├── search-core.js
├── app.js
├── sw.js
├── manifest.webmanifest
├── README.md
├── data/
│   ├── ms-ru.json
│   ├── ru-ms.json
│   └── build-report.json
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── tools/
│   └── build-lite-data.js
└── tests/
    └── search-core.test.js
```

## Локальный запуск

Из корня репозитория:

```bash
cd "/Users/mariatocinova/Documents/New project/dictionary-lite"
python3 -m http.server 8080
```

Открыть в браузере:

```text
http://localhost:8080/
```

Важно: прямое открытие `index.html` через `file://` может не работать, потому что браузеры блокируют загрузку JSON и Service Worker из локального файла.

## Пересборка оптимизированных данных

Из корня репозитория:

```bash
cd "/Users/mariatocinova/Documents/New project"
node dictionary-lite/tools/build-lite-data.js
```

Скрипт читает исходные данные полной версии, не меняет их, удаляет точные дубликаты и создаёт компактные файлы:

- `dictionary-lite/data/ms-ru.json`
- `dictionary-lite/data/ru-ms.json`
- `dictionary-lite/data/build-report.json`

## Как работает офлайн-режим

`sw.js` кэширует HTML, CSS, JavaScript, manifest, иконки и оба JSON-файла. Для статических ресурсов используется стратегия cache-first. Для навигации офлайн возвращается `index.html`.

Если обновляете файлы Lite-версии, увеличьте версию кэша в `sw.js`, например:

```js
const CACHE_NAME = 'malay-dictionary-lite-v2';
```

После этого браузер при следующем посещении заберёт свежие файлы и удалит старый кэш приложения.

## Размещение на GitHub Pages

Папку `dictionary-lite` можно открыть как подпапку сайта, например:

```text
https://citer529212.github.io/malay-ru-dictionary/dictionary-lite/
```

Все пути относительные (`./app.js`, `./data/ru-ms.json`), поэтому размещение в подпапке не должно ломать загрузку.

## Поиск

- Запускается с двух символов.
- Есть debounce 140 мс.
- Русский поиск считает `е` и `ё` эквивалентными.
- Сначала идут точные заголовки, затем начало слова, слово внутри заголовка, вхождение в заголовок и только потом перевод.
- Показываются первые 50 результатов и общее число совпадений.
- Результаты создаются через DOM API, словарные данные не вставляются через `innerHTML`.

## Проверки

```bash
cd "/Users/mariatocinova/Documents/New project"
node --check dictionary-lite/app.js
node --check dictionary-lite/search-core.js
node --check dictionary-lite/sw.js
node dictionary-lite/tests/search-core.test.js
```

## Известные ограничения

- Это словарь без просмотра PDF-страниц.
- Качество перевода зависит от качества исходных JSON-баз.
- При первом открытии нужно подключение к файлам сайта, чтобы браузер закэшировал данные.
- На очень слабых компьютерах первое чтение обеих баз может занять несколько секунд, но интерфейс не блокируется намеренно: второе направление подгружается в фоне.
