(function (global) {
  'use strict';

  const MAX_RESULTS = 50;

  function normalizeText(value, direction) {
    let text = String(value || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
    if (direction === 'ru-ms') {
      text = text.replace(/ё/g, 'е');
    }
    return text;
  }

  function tokenizeTitle(title) {
    return normalizeText(title, 'ru-ms')
      .split(/[\s,;:.!?()[\]{}"'«»]+/)
      .filter(Boolean);
  }

  function prepareEntries(entries, direction) {
    return entries.map((entry, index) => {
      const title = String(entry[0] || '').trim();
      const body = String(entry[1] || '').trim();
      return {
        id: index,
        title,
        body,
        normTitle: normalizeText(title, direction),
        normBody: normalizeText(body, direction),
        titleWords: tokenizeTitle(title),
      };
    });
  }

  function scoreEntry(entry, rawQuery, direction) {
    const query = normalizeText(rawQuery, direction);
    if (query.length < 2) return Infinity;

    const title = entry.normTitle;
    const body = entry.normBody;
    const queryLen = query.length;
    const lenDelta = Math.abs(title.length - queryLen);

    if (title === query) return 0;
    if (title.startsWith(query)) return 10 + Math.min(lenDelta, 20) / 10;
    if (entry.titleWords.some((word) => normalizeText(word, direction).startsWith(query))) {
      return 20 + Math.min(lenDelta, 20) / 10;
    }
    if (title.includes(query)) return 30 + Math.min(lenDelta, 30) / 10;
    if (body.includes(query)) return 50 + Math.min(body.indexOf(query), 80) / 80;
    return Infinity;
  }

  function searchEntries(entries, rawQuery, direction, limit = MAX_RESULTS) {
    const query = normalizeText(rawQuery, direction);
    if (query.length < 2) {
      return { total: 0, results: [] };
    }

    const rows = [];
    for (const entry of entries) {
      const score = scoreEntry(entry, query, direction);
      if (Number.isFinite(score)) {
        rows.push({ entry, score });
      }
    }

    rows.sort((a, b) =>
      a.score - b.score ||
      a.entry.title.length - b.entry.title.length ||
      a.entry.title.localeCompare(b.entry.title)
    );

    return {
      total: rows.length,
      results: rows.slice(0, limit).map((row) => row.entry),
    };
  }

  const api = { normalizeText, prepareEntries, scoreEntry, searchEntries, MAX_RESULTS };
  global.DictionaryLiteSearch = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
