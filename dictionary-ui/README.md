# Малайско-русский словарь (веб-оболочка)

Веб-интерфейс для электронного словаря на основе PDF:
- загрузка PDF словаря через браузер
- построение индекса по текстовому слою (если он есть)
- поиск по малайским заголовкам и русским переводам
- просмотр страницы, на которой найдена словарная статья

## Локальный запуск

```bash
cd "dictionary-ui"
python3 -m http.server 8080
```

Откройте [http://localhost:8080](http://localhost:8080), затем выберите PDF-файл.

## Особенности текущего PDF

Файл `Большой малайско-русский словарь.pdf` очень тяжелый (сотни МБ) и похож на скан.
Если текстовый слой есть, поиск заработает сразу.
Если это только изображения страниц, нужен отдельный OCR-этап для полноценного поиска.

## Режим "как онлайн-словарь" (JSON-база)

Лучшее качество поиска дает не OCR-фрагменты, а отдельная словарная база
`headword -> translation -> page`.

### 1) Получить sidecar-текст из OCR-PDF

```bash
cd dictionary-ui
./tools/make_sidecar.sh \
"/Users/mariatocinova/Downloads/Большой малайско-русский словарь_OCR.pdf" \
"/Users/mariatocinova/Downloads/dictionary_sidecar.txt"
```

### 2) Собрать JSON-словарь

```bash
python3 ./tools/build_dictionary_json_from_sidecar.py \
  --sidecar "/Users/mariatocinova/Downloads/dictionary_sidecar.txt" \
  --output "./data/dictionary.json"
```

### 3) Запустить сайт

После появления `dictionary-ui/data/dictionary.json` интерфейс автоматически
подхватит JSON-базу и будет искать по ней в приоритете.

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
