#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSegment, parseImportedMemory, rankSegments, sanitizeSegment, segmentSimilarity, toTmx } from "../translation-memory-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "translation-memory.js"), "utf8");
const builder = fs.readFileSync(path.join(root, "tools/build_offline_html.mjs"), "utf8");

assert.equal(normalizeSegment("Военно-политический  диалог"), "военно политический диалог");
assert.equal(segmentSimilarity("стороны достигли соглашения", "стороны достигли окончательного соглашения"), 75);

const rows = [
  sanitizeSegment({ source: "Стороны достигли соглашения", target: "Pihak-pihak mencapai persetujuan", domain: "politics", status: "verified" }),
  sanitizeSegment({ source: "Военное сотрудничество укрепляется", target: "Kerjasama ketenteraan semakin kukuh", domain: "military", status: "machine" }),
];
assert.equal(rankSegments("стороны достигли соглашения", rows)[0].score, 100);
assert.equal(rankSegments("военное сотрудничество", rows, "military")[0].domain, "military");
assert.equal(rankSegments("военное сотрудничество", rows, "culture").length, 0);

const importedJson = parseImportedMemory(JSON.stringify({ segments: [{ source: "Культурное наследие", target: "Warisan budaya", domain: "culture" }] }));
assert.equal(importedJson[0].status, "machine");
const importedCsv = parseImportedMemory('source,target,domain,status\n"Религиозная община","Komuniti agama",religion,reviewed', "csv");
assert.equal(importedCsv[0].domain, "religion");
assert.equal(importedCsv[0].status, "reviewed");
assert.match(toTmx(rows), /<tmx version="1\.4">/);
assert.match(toTmx(rows), /xml:lang="ms"/);

for (const id of ["dictionaryPanel", "memoryPanel", "tmSource", "tmTarget", "tmDomain", "tmStatus", "tmImportFile", "tmExportJson", "tmExportTmx"]) {
  assert.match(html, new RegExp(`id="${id}"`), `Missing UI element: ${id}`);
}
assert.match(html, /data-product-tab="memory"/);
assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
assert.match(app, /status: row\.status \|\| "machine"/);
assert.doesNotMatch(app, /fetch\(|sendBeacon|XMLHttpRequest/);
assert.match(builder, /translationMemoryCore/);
assert.match(builder, /translationMemoryApp/);

console.log("Translation memory QA passed");
console.log("Domains: politics, culture, religion, military");
console.log("Import: JSON and CSV; export: JSON and TMX");
console.log("Privacy: localStorage only, no network transmission");
