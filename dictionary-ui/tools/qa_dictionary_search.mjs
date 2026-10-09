#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectQueryScript,
  directionForQuery,
  generateMalayBaseCandidates,
  levenshteinDistance,
  normalizeRussianSearchKey,
  russianTypoDistanceLimit,
} from "../search-core.js";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolDir, "..");
const dataDir = path.join(projectDir, "data");
const FREQUENCY_BASELINE_SHA256 =
  "42390eb04356a59bb0b2bb70cd1a8523b41a250dd1892da2e726c5b47a1b62d6";
const RU_MS_FREQUENCY_500_SHA256 =
  "6a8d6692ff4a571236761a3f75dea7fbc90ee4af7bdb6285421b4f3f68f9a69b";
const MS_RU_FREQUENCY_500_SHA256 =
  "a83182a0c1ce9c0f1621ab27352f37f7726570120803245085c21296e691c33a";

const fixtures = [
  ["золотой", /emas/i],
  ["маленький", /kecil/i],
  ["большой", /besar/i],
  ["красный", /merah/i],
  ["черный", /hitam/i],
  ["белый", /putih/i],
  ["зеленый", /hijau/i],
  ["синий", /biru/i],
  ["желтый", /kuning/i],
  ["дом", /rumah/i],
  ["вода", /air/i],
  ["огонь", /api/i],
  ["земля", /tanah/i],
  ["камень", /batu/i],
  ["солнце", /matahari/i],
  ["луна", /bulan/i],
  ["небо", /langit/i],
  ["день", /hari/i],
  ["ночь", /malam/i],
  ["человек", /orang|manusia/i],
  ["мужчина", /lelaki|laki-laki/i],
  ["женщина", /perempuan|wanita/i],
  ["ребенок", /kanak-kanak|anak/i],
  ["мать", /ibu/i],
  ["отец", /bapa|ayah/i],
  ["специальная военная операция", /operasi ketenteraan khas/i],
  ["беспилотник", /pesawat tanpa pemandu|dron/i],
  ["дрон", /dron/i],
  ["ПВО", /pertahanan udara/i],
  ["воздушная тревога", /amaran serangan udara/i],
  ["санкции", /sekatan/i],
  ["военнопленный", /tawanan perang/i],
  ["кибератака", /serangan siber/i],
  ["скачать", /^muat turun$/i],
  ["пользователь", /^pengguna$/i],
  ["сервер", /^pelayan$/i],
  ["видеозвонок", /^panggilan video$/i],
  ["искусственный интеллект", /^kecerdasan buatan$/i],
  ["нейронная сеть", /^rangkaian neural$/i],
  ["программное обеспечение", /^perisian$/i],
  ["спутник", /^satelit$/i],
  ["QR-код", /^kod QR$/i],
  ["видеоконференция", /^persidangan video$/i],
  ["киберугроза", /^ancaman siber$/i],
  ["вредоносная программа", /^perisian hasad$/i],
  ["электромобиль", /^kereta elektrik$/i],
  ["зарядная станция", /^stesen pengecasan$/i],
  ["онлайн-платеж", /^pembayaran dalam talian$/i],
  ["стриминг", /^penstriman$/i],
  ["контент", /^kandungan$/i],
  ["обновить", /^kemas kini$/i],
  ["обновление", /^kemas kini$/i],
  ["поисковая система", /^enjin carian$/i],
  ["веб-страница", /^halaman web$/i],
  ["фишинг", /^pancingan data$/i],
];

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim()
    .replace(/\s+/g, " ");
}

function validateGold(entries) {
  const titles = new Map();
  const ids = new Set();

  for (const entry of entries) {
    assert.ok(entry.id, "Gold entry without id");
    assert.ok(!ids.has(entry.id), `Duplicate gold id: ${entry.id}`);
    ids.add(entry.id);

    const title = normalize(entry.title);
    assert.ok(title, `Gold entry ${entry.id} has an empty title`);
    assert.ok(entry.verified, `Gold entry is not verified: ${entry.title}`);
    assert.match(title, /^[а-яa-z0-9 .()\-/]+$/iu, `Suspicious gold title: ${entry.title}`);
    assert.ok(title.split(" ").length <= 6, `Gold title is too long: ${entry.title}`);
    assert.match(String(entry.body), /[a-z]/i, `Translation has no Latin text: ${entry.title}`);
    assert.doesNotMatch(
      String(entry.body),
      /[{}[\]<>_|]/,
      `Suspicious OCR characters in gold translation: ${entry.title}`
    );

    if (!titles.has(title)) titles.set(title, []);
    titles.get(title).push(entry);
  }

  for (const [title, rows] of titles) {
    assert.equal(rows.length, 1, `Duplicate gold title: ${title}`);
  }

  return titles;
}

function validateFixtures(goldByTitle) {
  for (const [query, expectedTranslation] of fixtures) {
    const rows = goldByTitle.get(normalize(query)) || [];
    assert.equal(rows.length, 1, `Missing exact gold result for: ${query}`);
    assert.match(rows[0].body, expectedTranslation, `Wrong translation for: ${query}`);
  }
}

function validateNoCuratedOverride(goldByTitle, curatedEntries) {
  const conflicts = [];
  for (const entry of curatedEntries) {
    const title = normalize(entry.title);
    if (!goldByTitle.has(title)) continue;
    const gold = goldByTitle.get(title)[0];
    if (normalize(entry.body) !== normalize(gold.body)) {
      conflicts.push(title);
    }
  }

  // Loading order and the explicit gold score must keep all these conflicts below gold.
  const appSource = fs.readFileSync(path.join(projectDir, "app.js"), "utf8");
  assert.match(appSource, /\.\.\.goldEntries,\s+\.\.\.specializedEntries,\s+\.\.\.curatedEntries/s);
  assert.match(appSource, /goldEntries = goldEntries\.filter\(isRuMsGoldEntryQuality\)/);
  assert.match(appSource, /isGoldEntry\(entry\)/);
  assert.match(appSource, /const inferredDirection = directionForQuery\(query\)/);
  assert.match(appSource, /switchDirection\(inferredDirection/);
  return new Set(conflicts).size;
}

function validateSpecializedDocx(entries, payload) {
  assert.equal(payload.direction, "ms-ru", "Specialized DOCX has wrong direction");
  assert.equal(payload.entry_count, 4683, "Specialized DOCX metadata count changed");
  assert.equal(payload.unique_title_count, 4681, "Specialized title count changed");
  assert.equal(payload.corrected_source_rows, 12, "Specialized correction count changed");
  assert.equal(entries.length, 4683, "Specialized DOCX import is incomplete");

  const ids = new Set();
  const titleCounts = new Map();
  for (const entry of entries) {
    assert.ok(entry.id.startsWith("ms-source-docx-"), `Wrong specialized id: ${entry.id}`);
    assert.ok(!ids.has(entry.id), `Duplicate specialized id: ${entry.id}`);
    ids.add(entry.id);
    const title = normalize(entry.title);
    assert.ok(title && entry.body.trim(), `Empty specialized row: ${entry.id}`);
    titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
    assert.equal(entry.source, "malaysian-russian-ready-docx", `Wrong source: ${entry.title}`);
  }

  const byTitle = new Map(entries.map((entry) => [normalize(entry.title), entry]));
  const samples = [
    ["aci torsion", /торсион/i],
    ["agensi perisikan", /спецслужба/i],
    ["gencatan senjata", /прекращение огня/i],
    ["dron", /^дрон$/i],
    ["uav", /беспилотник/i],
    ["kapal induk pesawat udara", /авианосец/i],
    ["pesawat tanpa pemandu", /беспилотный летательный аппарат/i],
    ["zon larangan terbang", /запретная зона/i],
  ];
  for (const [title, expected] of samples) {
    assert.ok(byTitle.has(title), `Missing specialized term: ${title}`);
    assert.match(byTitle.get(title).body, expected, `Wrong specialized translation: ${title}`);
  }

  const duplicateTitles = [...titleCounts].filter(([, count]) => count > 1);
  assert.deepEqual(
    duplicateTitles.map(([title]) => title).sort(),
    ["pengawalan", "pertahanan"],
    "Unexpected specialized duplicate titles"
  );

  const sourceAnomalies = entries.filter(
    (entry) => /[а-яё]/i.test(entry.title) || !/[а-яё]/i.test(entry.body)
  );
  assert.equal(sourceAnomalies.length, 0, "Corrected source anomalies returned");
  return sourceAnomalies.length;
}

function validateSpecializedReverse(entries, payload) {
  assert.equal(payload.direction, "ru-ms", "Specialized reverse index has wrong direction");
  assert.equal(payload.entry_count, 5582, "Specialized reverse entry count changed");
  assert.equal(payload.relation_count, 6105, "Specialized reverse relation count changed");
  assert.equal(entries.length, payload.entry_count, "Specialized reverse index is incomplete");

  const titles = new Set();
  const byTitle = new Map();
  for (const entry of entries) {
    const title = normalize(entry.title);
    assert.ok(!titles.has(title), `Duplicate reverse title: ${entry.title}`);
    titles.add(title);
    assert.match(title, /[а-яё]/i, `Reverse title is not Russian: ${entry.title}`);
    assert.match(entry.body, /[a-z]/i, `Reverse translation is missing: ${entry.title}`);
    assert.equal(entry.source, "reverse-index-from-malaysian-russian-ready-docx");
    byTitle.set(title, entry.body);
  }

  const samples = [
    ["прекращение огня", /gencatan senjata/i],
    ["беспилотник", /pesawat tanpa pemandu.*UAV/i],
    ["авианосец", /kapal induk pesawat udara/i],
    ["запретная зона для полетов", /zon larangan terbang/i],
    ["спецслужба", /agensi perisikan/i],
    ["огневая мощь оружия", /daya tembak senjata/i],
    ["динамика боя", /dinamik pertempuran/i],
    ["охрана", /pengawal.*pengawalan/i],
  ];
  for (const [title, expected] of samples) {
    assert.ok(byTitle.has(title), `Missing reverse term: ${title}`);
    assert.match(byTitle.get(title), expected, `Wrong reverse translation: ${title}`);
  }
}

function validateRussianQueryNormalization() {
  const equivalentForms = [
    ["беспилотники", "беспилотник"],
    ["беспилотниками", "беспилотник"],
    ["санкциями", "санкции"],
    ["специальной военной операции", "специальная военная операция"],
    ["воздушной тревоги", "воздушная тревога"],
  ];

  for (const [query, headword] of equivalentForms) {
    assert.equal(
      normalizeRussianSearchKey(query),
      normalizeRussianSearchKey(headword),
      `Russian form does not resolve to its headword: ${query}`
    );
  }

  const allowedTypos = [
    ["беспелотник", "беспилотник"],
    ["кибератка", "кибератака"],
    ["специальная военая операция", "специальная военная операция"],
  ];
  for (const [query, headword] of allowedTypos) {
    const queryKey = normalizeRussianSearchKey(query);
    const distance = levenshteinDistance(queryKey, normalizeRussianSearchKey(headword));
    assert.ok(
      distance <= russianTypoDistanceLimit(queryKey),
      `Safe typo is outside the correction threshold: ${query}`
    );
  }

  assert.equal(russianTypoDistanceLimit("дом"), 0, "Short words must not use fuzzy correction");
}

function validateMalayMorphology(msRuTitles) {
  const cases = [
    ["menulis", "tulis"],
    ["membaca", "baca"],
    ["mengambil", "ambil"],
    ["berjalan", "jalan"],
    ["pekerjaan", "kerja"],
    ["menyapu", "sapu"],
    ["memakai", "pakai"],
    ["rumah-rumah", "rumah"],
    ["dibacakan", "baca"],
  ];

  for (const [query, expectedBase] of cases) {
    const candidates = generateMalayBaseCandidates(query);
    assert.ok(candidates.includes(expectedBase), `Malay base was not generated: ${query}`);
    assert.ok(msRuTitles.has(expectedBase), `Malay base is absent from the dictionary: ${expectedBase}`);
    assert.ok(!candidates.includes(query), `Derived Malay candidates contain the original query: ${query}`);
  }
}

function validateBidirectionalFrequencyCoverage(goldEntries, msRuEntries) {
  const ruMs = goldEntries.slice(0, 500);
  const msRu = msRuEntries.slice(0, 500);
  assert.equal(ruMs.length, 500, "RU-MS frequency set must contain 500 entries");
  assert.equal(msRu.length, 500, "MS-RU frequency set must contain 500 entries");

  const validateUniqueTitles = (entries, direction) => {
    const titles = entries.map((entry) => normalize(entry.title));
    assert.equal(new Set(titles).size, entries.length, `${direction} frequency set has duplicate titles`);
  };
  validateUniqueTitles(ruMs, "RU-MS");
  validateUniqueTitles(msRu, "MS-RU");

  for (const entry of ruMs) {
    assert.match(entry.title, /[а-яё]/i, `RU-MS frequency headword is not Russian: ${entry.title}`);
    assert.match(entry.body, /[a-z]/i, `RU-MS frequency translation is missing: ${entry.title}`);
    assert.doesNotMatch(entry.body, /[{}[\]<>_|^]|\b(?:nan|undefined|null)\b/i);
  }
  for (const entry of msRu) {
    assert.match(entry.title, /^[a-z][a-z .'-]*$/i, `MS-RU frequency headword is invalid: ${entry.title}`);
    assert.match(entry.body, /[а-яё]/i, `MS-RU frequency translation is missing: ${entry.title}`);
    assert.doesNotMatch(entry.body, /[{}[\]<>_|^]|\b(?:nan|undefined|null)\b/i);
  }
}

function validateExpandedFrequencyBaselines(ruMsEntries, msRuEntries) {
  const digest = (entries) => {
    const canonical = entries
      .slice(0, 500)
      .map((entry) => `${normalize(entry.title)}|${String(entry.body).trim().toLowerCase()}`)
      .join("\n");
    return crypto.createHash("sha256").update(canonical).digest("hex");
  };
  assert.equal(digest(ruMsEntries), RU_MS_FREQUENCY_500_SHA256, "RU-MS top-500 baseline changed");
  assert.equal(digest(msRuEntries), MS_RU_FREQUENCY_500_SHA256, "MS-RU top-500 baseline changed");
}

function validateMalayGold(entries) {
  const expected = new Map([
    ["tulis", /писать/i], ["baca", /читать/i], ["ambil", /брать/i],
    ["jalan", /дорога|идти/i], ["kerja", /работа/i], ["sapu", /подметать/i],
    ["pakai", /использовать|носить/i], ["rumah", /дом/i],
    ["menulis", /писать/i], ["membaca", /читать/i], ["mengambil", /брать/i],
    ["berjalan", /идти|ходить/i], ["pekerjaan", /работа/i], ["menyapu", /подметать/i],
    ["memakai", /использовать|носить/i], ["rumah-rumah", /дома/i],
    ["dibacakan", /прочитанным/i],
    ["muat turun", /скачать/i], ["pengguna", /^пользователь$/i],
    ["pelayan", /сервер/i], ["panggilan video", /^видеозвонок$/i],
    ["kecerdasan buatan", /^искусственный интеллект$/i],
    ["rangkaian neural", /^нейронная сеть$/i], ["perisian", /^программное обеспечение$/i],
    ["satelit", /^спутник$/i], ["kod qr", /^qr-код$/i],
    ["persidangan video", /^видеоконференция$/i], ["ancaman siber", /^киберугроза$/i],
    ["perisian hasad", /^вредоносная программа$/i], ["kereta elektrik", /^электромобиль$/i],
    ["stesen pengecasan", /^зарядная станция$/i],
    ["pembayaran dalam talian", /^онлайн-платёж$/i], ["penstriman", /стриминг/i],
    ["kandungan", /контент/i], ["kemas kini", /обновление/i],
    ["enjin carian", /^поисковая система$/i], ["halaman web", /^веб-страница$/i],
    ["pancingan data", /фишинг/i],
  ]);
  assert.equal(entries.length, expected.size, "Unexpected MS-RU gold size");
  for (const entry of entries) {
    assert.ok(entry.verified, `MS-RU gold entry is not verified: ${entry.title}`);
    assert.match(entry.body, expected.get(normalize(entry.title)), `Wrong MS-RU gold translation: ${entry.title}`);
  }
}

function validateDirectionDetection() {
  const cases = [
    ["дом", "cyrillic", "ru-ms"],
    ["специальная военная операция", "cyrillic", "ru-ms"],
    ["rumah", "latin", "ms-ru"],
    ["pesawat tanpa pemandu", "latin", "ms-ru"],
    ["ПВО", "cyrillic", "ru-ms"],
    ["QR оплата", "cyrillic", "ru-ms"],
    ["123", "mixed", null],
  ];
  for (const [query, script, direction] of cases) {
    assert.equal(detectQueryScript(query), script, `Wrong script detection: ${query}`);
    assert.equal(directionForQuery(query), direction, `Wrong direction detection: ${query}`);
  }
}

function validateFrequencyBaseline(entries) {
  const canonical = entries
    .slice(0, 100)
    .map((entry) => `${normalize(entry.title)}|${String(entry.body).trim().toLowerCase()}`)
    .join("\n");
  const digest = crypto.createHash("sha256").update(canonical).digest("hex");
  assert.equal(digest, FREQUENCY_BASELINE_SHA256, "Top-100 frequency baseline changed");
}

function validateModernInterface() {
  const html = fs.readFileSync(path.join(projectDir, "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(projectDir, "app.js"), "utf8");
  assert.match(html, /Чернобаев Б\.Д\./);
  assert.match(html, /Михина А\.А\./);
  assert.match(html, /Большой малайско-русский словарь/);
  assert.match(html, /Русско-малайзийский словарь/);
  assert.match(html, /Дополнительная специализированная база/);
  assert.match(html, /4 683 статьи/);
  assert.match(html, /5 582 обратных заголовка/);
  assert.doesNotMatch(html, /type="file"|Выбрать PDF|pdfCanvas/);
  assert.doesNotMatch(appSource, /pdfjsLib|loadPdfFile|renderCurrentPage/);
  assert.match(appSource, /function renderSuggestions\(query\)/);
  assert.match(appSource, /MISSING_QUERIES_KEY/);
  assert.match(appSource, /localStorage\.setItem\(MISSING_QUERIES_KEY/);
  assert.match(appSource, /downloadMissingQueries\("json"\)/);
  assert.match(appSource, /downloadMissingQueries\("csv"\)/);
  assert.match(appSource, /function isBestAnswerQuality\(entry\)/);
  assert.match(appSource, /if \(!isBestAnswerQuality\(row\)\) return false/);
  assert.match(
    appSource,
    /if \(!goldEntries\.length && !specializedEntries\.length && !curatedEntries\.length\)/
  );
  assert.match(appSource, /DICTIONARY_DATA_VERSION = "2026-10-09-v6-10"/);
  assert.match(appSource, /cache: "force-cache"/);
  assert.match(appSource, /titleBuckets: new Map\(\)/);
  assert.match(
    appSource,
    /function indexedEntriesForQuery\(queryLoose, malayBaseCandidates = \[\], russianKey = ""\)/
  );
  assert.match(appSource, /return indexedEntries/);
  assert.match(appSource, /dataset\.candidateCount = String\(state\.lastCandidateCount\)/);
  assert.match(appSource, /function mergeResults\(query, preparedEntries = null\)/);
  assert.match(appSource, /function computeBestAnswer\(query, preparedEntries = null\)/);
  assert.match(
    appSource,
    /const groupedEntries = query \? groupEntryResults\(searchEntries\(query\), query\) : \[\]/
  );
  assert.match(appSource, /computeBestAnswer\(query, groupedEntries\)/);
  assert.match(appSource, /mergeResults\(query, groupedEntries\)/);
  assert.match(appSource, /dictionaryCache: new Map\(\)/);
  assert.match(appSource, /const cachedDictionary = state\.dictionaryCache\.get\(cacheKey\)/);
  assert.match(appSource, /state\.dictionaryCache\.set\(cacheKey,/);
  assert.match(appSource, /state\.titleBuckets = cachedDictionary\.titleBuckets/);
  assert.match(appSource, /titlePrefixBuckets: new Map\(\)/);
  assert.match(appSource, /exactTitleKeys: new Set\(\)/);
  assert.match(appSource, /russianTitleKeys: new Set\(\)/);
  assert.match(appSource, /const usePrefixIndex = hasReliableAnchor/);
  assert.match(appSource, /indexedEntriesForQuery\(qLoose, malayBaseCandidates, qRuKey\)/);
  assert.doesNotMatch(appSource, /navigator\.sendBeacon|fetch\([^)]*missing/i);
  assert.match(html, /saveMissingButton/);
}

const gold = readJson("dictionary_ru_ms_gold.json").entries;
const msRuGold = readJson("dictionary_ms_ru_gold.json").entries;
const specializedPayload = readJson("dictionary_ms_ru_specialized.json");
const specializedMsRu = specializedPayload.entries;
const specializedReversePayload = readJson("dictionary_ru_ms_specialized_reverse.json");
const specializedRuMs = specializedReversePayload.entries;
const curatedRuMs = readJson("dictionary_ru_ms_curated.json").entries;
const curatedMsRu = readJson("dictionary_curated.json").entries;
const goldByTitle = validateGold(gold);

validateFixtures(goldByTitle);
validateRussianQueryNormalization();
validateMalayGold(msRuGold);
const specializedAnomalies = validateSpecializedDocx(specializedMsRu, specializedPayload);
validateSpecializedReverse(specializedRuMs, specializedReversePayload);
validateMalayMorphology(new Set([...msRuGold, ...curatedMsRu].map((entry) => normalize(entry.title))));
validateBidirectionalFrequencyCoverage(gold, curatedMsRu);
validateExpandedFrequencyBaselines(gold, curatedMsRu);
validateDirectionDetection();
validateFrequencyBaseline(gold);
validateModernInterface();
const protectedConflicts = validateNoCuratedOverride(goldByTitle, curatedRuMs);

console.log("Dictionary QA passed");
console.log(`Gold RU-MS entries: ${gold.length}`);
console.log(`Gold MS-RU entries: ${msRuGold.length}`);
console.log(`Curated RU-MS entries: ${curatedRuMs.length}`);
console.log(`Curated MS-RU entries: ${curatedMsRu.length}`);
console.log(`Reference searches: ${fixtures.length}`);
console.log("Russian morphology and safe typo checks: 9");
console.log("Malay morphology checks: 9");
console.log(`Specialized DOCX entries: ${specializedMsRu.length}`);
console.log(`Corrected source anomalies remaining: ${specializedAnomalies}`);
console.log(`Specialized reverse entries: ${specializedRuMs.length}`);
console.log(`Specialized reverse relations: ${specializedReversePayload.relation_count}`);
console.log("Bidirectional frequency checks: 500 RU-MS + 500 MS-RU");
console.log("Automatic direction checks: 7");
console.log("Protected frequency baseline: 1000 entries");
console.log("Modern no-upload interface checks: passed");
console.log("Local missing-query export checks: passed");
console.log(`Gold titles protected from conflicting OCR entries: ${protectedConflicts}`);
