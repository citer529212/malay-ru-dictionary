#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolDir, "..");
const outputDir = path.resolve(projectDir, "..", "Dictionary-Offline-HTML");
const outputName = "Malay-Russian-Dictionary-Offline-v6.16.html";

const dataFiles = [
  "data/dictionary_ms_ru_gold.json",
  "data/dictionary_ms_ru_specialized.json",
  "data/dictionary_curated.json",
  "data/dictionary_ru_ms_gold.json",
  "data/dictionary_ru_ms_specialized_reverse.json",
  "data/dictionary_ru_ms_curated.json",
  "data/dictionary_ru_ms_service.json",
  "data/dictionary.json",
  "data/dictionary_ru_ms.json",
];

function read(relativePath) {
  return fs.readFileSync(path.join(projectDir, relativePath), "utf8");
}

function scriptSafeJson(text) {
  return text.replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function dataId(relativePath) {
  return `offline-${relativePath.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
}

let html = read("index.html");
const css = read("styles.css");
const searchCore = read("search-core.js").replace(/\bexport\s+(?=function\s)/g, "");
const app = read("app.js").replace(/^import\s*\{[\s\S]*?\}\s*from\s*"\.\/search-core\.js\?v=\d+";\s*/u, "");

const embeddedData = dataFiles
  .filter((relativePath) => fs.existsSync(path.join(projectDir, relativePath)))
  .map((relativePath) => {
    const json = read(relativePath);
    JSON.parse(json);
    return `<script type="application/json" id="${dataId(relativePath)}">${scriptSafeJson(json)}</script>`;
  })
  .join("\n");

const offlineLoader = `
const OFFLINE_DATA_IDS = ${JSON.stringify(
  Object.fromEntries(dataFiles.map((relativePath) => [`./${relativePath}`, dataId(relativePath)]))
)};

async function fetchDictionaryEntries(url, options = {}) {
  try {
    const cleanUrl = String(url || "").split("?")[0];
    const element = document.getElementById(OFFLINE_DATA_IDS[cleanUrl]);
    if (!element) return [];
    const payload = JSON.parse(element.textContent);
    if (!payload || !Array.isArray(payload.entries) || payload.entries.length === 0) return [];
    return payload.entries
      .filter((entry) => entry && entry.title && entry.body)
      .map((entry, index) => normalizeIncomingEntry(entry, index, options));
  } catch (error) {
    console.error("Не удалось прочитать встроенную словарную базу", error);
    return [];
  }
}
`;

const offlineApp = app.replace(
  /async function fetchDictionaryEntries\(url, options = \{\}\) \{[\s\S]*?\n\}\n\nfunction isSupplementEntryQuality/u,
  `${offlineLoader}\nfunction isSupplementEntryQuality`
);
if (!offlineApp.includes("OFFLINE_DATA_IDS")) {
  throw new Error("Could not replace fetchDictionaryEntries in app.js");
}

html = html
  .replace(
    /\s*<link rel="preconnect"[\s\S]*?<\/head>/u,
    () => `\n    <style>${css}</style>\n  </head>`
  )
  .replace(
    /<script type="module" src="\.\/app\.js\?v=[^"]+"><\/script>/u,
    () => `${embeddedData}\n<script>\n${searchCore}\n${offlineApp}\n</script>`
  )
  .replace(
    "Версия 2026.10.10 · словоформы в контексте v6.16",
    "Офлайн-версия 6.16 · один HTML · без интернета"
  );

if (/https?:\/\//i.test(html)) {
  throw new Error("Offline HTML still contains a network URL");
}

fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, outputName);
fs.writeFileSync(outputPath, html);
const hash = crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex");
fs.writeFileSync(`${outputPath}.sha256`, `${hash}  ${outputName}\n`);
fs.writeFileSync(
  path.join(outputDir, "README.txt"),
  `МАЛАЙСКО-РУССКИЙ И РУССКО-МАЛАЙСКИЙ СЛОВАРЬ — ОФЛАЙН\n\n` +
    `1. Перенесите файл ${outputName} на любой ноутбук.\n` +
    `2. Откройте его двойным щелчком в Chrome, Edge, Firefox или Safari.\n` +
    `3. Интернет, установка и локальный сервер не требуются.\n\n` +
    `Файл .sha256 нужен только для проверки целостности архива.\n` +
    `Разработчики: Чернобаев Б.Д., Михина А.А.\n`
);

console.log(JSON.stringify({ outputPath, bytes: fs.statSync(outputPath).size, sha256: hash }, null, 2));
