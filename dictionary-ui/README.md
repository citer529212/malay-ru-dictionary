# Малайско-русский и русско-малайский электронный словарь

Автономное веб-приложение с двунаправленным поиском. Пользователь сразу вводит
русское или малайское слово, после чего приложение автоматически определяет
направление, предлагает варианты и показывает проверенный перевод.

Разработчики: Чернобаев Б.Д. и Михина А.А.

Словарная база составлена на основе:

- «Большого малайско-русского словаря» Т.В. Дорофеевой, Е.С. Кукушкиной,
  В.А. Погадаева;
- «Русско-малайзийского словаря» В.А. Погадаева, Н.В. Ротт.

## Локальный запуск

```bash
cd "dictionary-ui"
python3 -m http.server 8080
```

Откройте [http://localhost:8080](http://localhost:8080). Загружать дополнительные
файлы не требуется: обе базы входят в приложение.

## Проверенная база (рекомендуется)

Файл `dictionary-ui/data/dictionary_curated.json` имеет самый высокий приоритет.
Если он существует, интерфейс работает в режиме только проверенных статей
(без OCR-фрагментов в выдаче).

Чтобы улучшать качество, добавляйте/правьте записи именно в
`dictionary_curated.json`.

## Публикация на GitHub

В репозитории уже добавлен workflow для GitHub Pages:
`.github/workflows/deploy-dictionary-ui.yml`

После пуша в GitHub сайт будет публиковаться автоматически из папки `dictionary-ui`.

## Автоматическая проверка качества

Перед публикацией запустите контроль точных переводов и целостности gold-базы:

```bash
node dictionary-ui/tools/qa_dictionary_search.mjs
```

Проверка останавливается с ошибкой, если пропал эталонный перевод, появился
дубликат или грязная OCR-запись получила возможность заменить проверенную статью.

### Минимальные шаги

1. Создайте репозиторий на GitHub (пустой, без README).
2. В текущем проекте выполните:

```bash
git add dictionary-ui .github/workflows/deploy-dictionary-ui.yml
git commit -m "Add Malay-RU dictionary web shell"
git branch -M main
git remote add origin <ВАШ_HTTPS_ИЛИ_SSH_URL>
git push -u origin main
```

3. На GitHub зайдите в `Settings -> Pages` и убедитесь, что источник настроен на `GitHub Actions`.

## Pipeline v2 (рекомендуется для качества)

Новый конвейер строит структурированную базу и сразу считает качество.

### 1) Подготовить sidecar-тексты

Для каждого OCR-PDF нужен TXT sidecar (разделитель страниц `\f`).

### 2) Запустить сборку

```bash
cd "dictionary-ui"
python3 ./tools/build_dictionary_pipeline_v2.py \
  --ms-ru-sidecar "/ABS/PATH/malay_ru_sidecar.txt" \
  --ru-ms-sidecar "/ABS/PATH/russian_malay_sidecar.txt" \
  --output-dir "./data" \
  --report "./data/dictionary_pipeline_report.json"
```

Или сразу от OCR-PDF (без ручного sidecar):

```bash
cd "dictionary-ui"
python3 ./tools/build_dictionary_pipeline_v2.py \
  --ms-ru-pdf "/ABS/PATH/malay_ru_ocr.pdf" \
  --ru-ms-pdf "/ABS/PATH/russian_malay_ocr.pdf" \
  --output-dir "./data" \
  --report "./data/dictionary_pipeline_report.json"
```

### 3) Что получится

- `data/dictionary_curated.json` (малайско-русский)
- `data/dictionary_ru_ms_curated.json` (русско-малайский)
- `data/dictionary_pipeline_report.json` (метрики)

В отчёте будут:
- число кандидатов
- число принятых/отбракованных
- итоговый размер базы
- покрытие контрольного набора частых слов

### 4) Как повышать качество дальше

1. Поднимать качество OCR страниц с плохим сканом и пересобирать.
2. Добавлять в `dictionary_ru_ms_gold.json` частотные слова, которых нет в OCR.
3. Повторять сборку и смотреть прирост `coverage_pct` в отчёте.
