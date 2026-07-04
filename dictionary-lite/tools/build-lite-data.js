#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'dictionary-lite', 'data');
const sources = {
  'ms-ru': [path.join(root, 'dictionary-ui', 'data', 'dictionary_curated.json')],
  'ru-ms': [
    path.join(root, 'dictionary-ui', 'data', 'dictionary_ru_ms_gold.json'),
    path.join(root, 'dictionary-ui', 'data', 'dictionary_ru_ms_curated.json'),
  ],
};

function readEntries(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : parsed.entries || [];
  return { rawBytes: Buffer.byteLength(raw), entries };
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
}

function validEntry(entry) {
  const title = cleanText(entry.title || entry[0]);
  const body = cleanText(entry.body || entry[1]);
  if (!title || !body) return null;
  if (title.length > 90 || body.length > 800) return null;
  return [title, body];
}

function buildDirection(direction, files) {
  const seenExact = new Set();
  const seenTitleBody = new Set();
  const rows = [];
  const stats = {
    direction,
    sourceFiles: files.map((file) => path.relative(root, file)),
    sourceEntries: 0,
    outputEntries: 0,
    removedDuplicates: 0,
    skippedInvalid: 0,
    sourceBytes: 0,
    outputBytes: 0,
  };

  for (const file of files) {
    const { rawBytes, entries } = readEntries(file);
    stats.sourceBytes += rawBytes;
    stats.sourceEntries += entries.length;

    for (const entry of entries) {
      const row = validEntry(entry);
      if (!row) {
        stats.skippedInvalid += 1;
        continue;
      }

      const [title, body] = row;
      const exactKey = `${title.toLowerCase()}\u0001${body.toLowerCase()}`;
      const titleBodyKey = `${cleanText(title).toLowerCase()}\u0001${cleanText(body).toLowerCase()}`;
      if (seenExact.has(exactKey) || seenTitleBody.has(titleBodyKey)) {
        stats.removedDuplicates += 1;
        continue;
      }
      seenExact.add(exactKey);
      seenTitleBody.add(titleBodyKey);
      rows.push([title, body]);
    }
  }

  rows.sort((a, b) => a[0].localeCompare(b[0], direction === 'ru-ms' ? 'ru' : 'ms'));
  const payload = JSON.stringify({ version: 1, direction, entries: rows });
  const outputFile = path.join(outDir, `${direction}.json`);
  fs.writeFileSync(outputFile, payload, 'utf8');
  stats.outputEntries = rows.length;
  stats.outputBytes = Buffer.byteLength(payload);
  return stats;
}

fs.mkdirSync(outDir, { recursive: true });
const report = Object.entries(sources).map(([direction, files]) => buildDirection(direction, files));
for (const item of report) {
  console.log(`${item.direction}: ${item.sourceEntries} -> ${item.outputEntries} entries, duplicates ${item.removedDuplicates}, invalid ${item.skippedInvalid}, size ${(item.sourceBytes/1024/1024).toFixed(2)} MB -> ${(item.outputBytes/1024/1024).toFixed(2)} MB`);
}
fs.writeFileSync(path.join(outDir, 'build-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
