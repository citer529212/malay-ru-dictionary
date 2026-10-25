#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { memoryStats, mergeSegments, normalizeSegment, parseImportedMemory, rankSegments, sanitizeSegment, segmentSimilarity, toCsv, toTmx } from "../translation-memory-core.js";

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
assert.equal(rankSegments("Kerjasama ketenteraan", rows)[0].matchedField, "target");
assert.equal(rankSegments("военное сотрудничество", rows, "military", "verified").length, 0);

const importedJson = parseImportedMemory(JSON.stringify({ segments: [{ source: "Культурное наследие", target: "Warisan budaya", domain: "culture" }] }));
assert.equal(importedJson[0].status, "machine");
const importedCsv = parseImportedMemory('source,target,domain,status\n"Религиозная община","Komuniti agama",religion,reviewed', "csv");
assert.equal(importedCsv[0].domain, "religion");
assert.equal(importedCsv[0].status, "reviewed");
const merged = mergeSegments(rows, [rows[0], sanitizeSegment({ source: "Новый сегмент", target: "Segmen baharu" })]);
assert.deepEqual({ added: merged.added, skipped: merged.skipped }, { added: 1, skipped: 1 });
assert.equal(memoryStats(merged.segments).total, 3);
assert.match(toCsv(rows), /"Стороны достигли соглашения"/);
assert.match(toTmx(rows), /<tmx version="1\.4">/);
assert.match(toTmx(rows), /xml:lang="ms"/);

for (const id of ["dictionaryPanel", "memoryPanel", "tmSource", "tmTarget", "tmDomain", "tmStatus", "tmStatusFilter", "tmDocument", "tmDelete", "tmImportFile", "tmExportJson", "tmExportCsv", "tmExportTmx", "tmStats"]) {
  assert.match(html, new RegExp(`id="${id}"`), `Missing UI element: ${id}`);
}
assert.match(html, /data-product-tab="memory"/);
assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
assert.match(app, /mergeSegments\(segments, imported\)/);
assert.doesNotMatch(app, /fetch\(|sendBeacon|XMLHttpRequest/);
assert.match(builder, /translationMemoryCore/);
assert.match(builder, /translationMemoryApp/);

console.log("Translation memory QA passed");
console.log("Domains: politics, culture, religion, military");
console.log("Import: deduplicated JSON and CSV; export: JSON, CSV and TMX");
console.log("Privacy: localStorage only, no network transmission");
