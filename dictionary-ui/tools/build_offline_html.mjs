#!/usr/bin/env node

import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolDir, "..");
const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(projectDir, "..", "Dictionary-Offline-HTML");
const dataFiles = [
  "data/dictionary_ms_ru_gold.json",
  "data/dictionary_ms_ru_specialized.json",
  "data/dictionary_curated.json",
  "data/dictionary_ru_ms_gold.json",
  "data/dictionary_ru_ms_specialized_reverse.json",
  "data/dictionary_ru_ms_curated.json",
  "data/dictionary_ru_ms_service.json",
];

const profiles = [
  {
    id: "full",
    label: "Full",
    description: "полная база с максимальным охватом",
    outputName: "Malay-Russian-Dictionary-Offline-v6.18.html",
    packageName: "Malay-Russian-Dictionary-Offline-v6.18.zip",
    curatedLimit: Number.POSITIVE_INFINITY,
  },
  {
    id: "lite",
    label: "Lite",
    description: "облегчённая база для слабых ноутбуков",
    outputName: "Malay-Russian-Dictionary-Offline-Lite-v6.18.html",
    packageName: "Malay-Russian-Dictionary-Offline-Lite-v6.18.zip",
    curatedLimit: 15_000,
  },
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
const contextCode = read("data/context-corpus.js").replace("export const contextCorpus", "const contextCorpus") + "\n" + read("context-core.js").replace(/^import[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\s)/g, "");
const app = contextCode + "\n" + read("app.js").replace(/^import[^\n]+;\n/gm, "").replace(/^import\s*\{[\s\S]*?\}\s*from\s*"\.\/search-core\.js\?v=\d+";\s*/u, "");

const dataPayloads = new Map(
  dataFiles
    .filter((relativePath) => fs.existsSync(path.join(projectDir, relativePath)))
    .map((relativePath) => [relativePath, JSON.parse(read(relativePath))])
);

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

fs.mkdirSync(outputDir, { recursive: true });
const legacyManifestPath = path.join(outputDir, "MANIFEST.json");
if (fs.existsSync(legacyManifestPath)) fs.unlinkSync(legacyManifestPath);
const readmePath = path.join(outputDir, "README.txt");
fs.writeFileSync(
  readmePath,
  `МАЛАЙСКО-РУССКИЙ И РУССКО-МАЛАЙСКИЙ СЛОВАРЬ — ОФЛАЙН\n\n` +
    `FULL: максимальный словарный охват.\n` +
    `LITE: ускоренный запуск на слабых ноутбуках, все gold- и специализированные статьи сохранены.\n\n` +
    `1. Перенесите выбранный HTML либо соответствующий ZIP на любой ноутбук.\n` +
    `2. Откройте его двойным щелчком в Chrome, Edge, Firefox или Safari.\n` +
    `3. Интернет, установка и локальный сервер не требуются.\n\n` +
    `Можно переносить один HTML либо весь ZIP-пакет.\n` +
    `Файл .sha256 нужен только для проверки целостности HTML.\n` +
    `Разработчики: Чернобаев Б.Д., Михина А.А.\n`
);

function payloadsForProfile(profile) {
  return new Map(
    [...dataPayloads.entries()].map(([relativePath, payload]) => {
      if (!relativePath.includes("curated") || !Number.isFinite(profile.curatedLimit)) {
        return [relativePath, payload];
      }
      return [
        relativePath,
        { ...payload, entries: payload.entries.slice(0, profile.curatedLimit) },
      ];
    })
  );
}

function buildProfile(profile) {
  const profilePayloads = payloadsForProfile(profile);
  const embeddedData = [...profilePayloads.entries()]
    .map(([relativePath, payload]) => {
      const compactJson = JSON.stringify(payload);
      return `<script type="application/json" id="${dataId(relativePath)}">${scriptSafeJson(compactJson)}</script>`;
    })
    .join("\n");

  const profileHtml = html
    .replace(
      /\s*<link rel="preconnect"[\s\S]*?<\/head>/u,
      () => `\n    <style>${css}</style>\n  </head>`
    )
    .replace(
      /<script type="module" src="\.\/app\.js\?v=[^"]+"><\/script>/u,
      () => `${embeddedData}\n<script>\n${searchCore}\n${offlineApp}\n</script>`
    )
    .replace(
      "Версия 2026.10.21 · одежда и еда v6.18",
      `Офлайн ${profile.label} 6.18 · один HTML · без интернета`
    );
  if (/https?:\/\//i.test(profileHtml)) {
    throw new Error(`${profile.label} HTML still contains a network URL`);
  }

  const outputPath = path.join(outputDir, profile.outputName);
  fs.writeFileSync(outputPath, profileHtml);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex");
  const hashPath = `${outputPath}.sha256`;
  const manifestPath = path.join(outputDir, `MANIFEST-${profile.label.toUpperCase()}.json`);
  const packagePath = path.join(outputDir, profile.packageName);
  fs.writeFileSync(hashPath, `${hash}  ${profile.outputName}\n`);

  const manifest = {
    product: "Малайско-русский и русско-малайский электронный словарь",
    version: "6.18",
    profile: profile.id,
    description: profile.description,
    format: "single-file-offline-html",
    network_required: false,
    html_file: profile.outputName,
    html_bytes: fs.statSync(outputPath).size,
    html_sha256: hash,
    sources: Object.fromEntries(
      [...profilePayloads.entries()].map(([relativePath, payload]) => [
        relativePath,
        Array.isArray(payload.entries) ? payload.entries.length : 0,
      ])
    ),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (fs.existsSync(packagePath)) fs.unlinkSync(packagePath);
  const zipResult = spawnSync(
    "zip",
    ["-j", "-9", packagePath, outputPath, hashPath, readmePath, manifestPath],
    { encoding: "utf8" }
  );
  if (zipResult.status !== 0) {
    throw new Error(`Could not create ${profile.label} ZIP: ${zipResult.stderr || zipResult.stdout}`);
  }
  const packageHash = crypto.createHash("sha256").update(fs.readFileSync(packagePath)).digest("hex");
  fs.writeFileSync(`${packagePath}.sha256`, `${packageHash}  ${profile.packageName}\n`);

  return {
      profile: profile.id,
      outputPath,
      bytes: fs.statSync(outputPath).size,
      sha256: hash,
      packagePath,
      packageBytes: fs.statSync(packagePath).size,
      packageSha256: packageHash,
  };
}

console.log(JSON.stringify(profiles.map(buildProfile), null, 2));
