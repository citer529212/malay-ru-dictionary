#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectQueryScript,
  directionForQuery,
  levenshteinDistance,
  normalizeRussianSearchKey,
  russianTypoDistanceLimit,
} from "../search-core.js";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolDir, "..");
const dataDir = path.join(projectDir, "data");
const FREQUENCY_BASELINE_SHA256 =
  "42390eb04356a59bb0b2bb70cd1a8523b41a250dd1892da2e726c5b47a1b62d6";

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
  assert.match(appSource, /deduplicateEntries\(\[\.\.\.goldEntries, \.\.\.curatedEntries/);
  assert.match(appSource, /goldEntries = goldEntries\.filter\(isRuMsGoldEntryQuality\)/);
  assert.match(appSource, /isGoldEntry\(entry\)/);
  assert.match(appSource, /const inferredDirection = directionForQuery\(query\)/);
  assert.match(appSource, /switchDirection\(inferredDirection/);
  return new Set(conflicts).size;
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
  assert.doesNotMatch(html, /type="file"|Выбрать PDF|pdfCanvas/);
  assert.doesNotMatch(appSource, /pdfjsLib|loadPdfFile|renderCurrentPage/);
  assert.match(appSource, /function renderSuggestions\(query\)/);
}

const gold = readJson("dictionary_ru_ms_gold.json").entries;
const curatedRuMs = readJson("dictionary_ru_ms_curated.json").entries;
const curatedMsRu = readJson("dictionary_curated.json").entries;
const goldByTitle = validateGold(gold);

validateFixtures(goldByTitle);
validateRussianQueryNormalization();
validateDirectionDetection();
validateFrequencyBaseline(gold);
validateModernInterface();
const protectedConflicts = validateNoCuratedOverride(goldByTitle, curatedRuMs);

console.log("Dictionary QA passed");
console.log(`Gold RU-MS entries: ${gold.length}`);
console.log(`Curated RU-MS entries: ${curatedRuMs.length}`);
console.log(`Curated MS-RU entries: ${curatedMsRu.length}`);
console.log(`Reference searches: ${fixtures.length}`);
console.log("Russian morphology and safe typo checks: 9");
console.log("Automatic direction checks: 7");
console.log("Protected frequency baseline: 100 entries");
console.log("Modern no-upload interface checks: passed");
console.log(`Gold titles protected from conflicting OCR entries: ${protectedConflicts}`);
