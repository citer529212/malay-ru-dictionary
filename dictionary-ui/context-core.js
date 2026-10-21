import { normalizeHeadwordLoose, directionForQuery } from './search-core.js?v=4';

const key = normalizeHeadwordLoose;
const contained = (text, phrase) => (` ${text} `).includes(` ${phrase} `);

// Only explicit, reviewed forms are accepted; heuristic stemming cannot invent a phrase.
export function searchContextCorpus(corpus, query, direction = directionForQuery(query)) {
  if (!direction || !key(query)) return [];
  const lang = direction === 'ru-ms' ? 'ru' : 'ms';
  const other = lang === 'ru' ? 'ms' : 'ru';
  const q = key(query);
  return corpus.flatMap(entry => {
    if (!entry.verified) return [];
    const forms = [...new Set([entry[lang], ...(entry.forms[lang] || [])])];
    const matches = forms.filter(form => contained(q, key(form)));
    if (!matches.length) return [];
    matches.sort((a, b) => key(b).split(' ').length - key(a).split(' ').length || b.length - a.length);
    const matched = matches[0];
    const matchKind = q === key(entry[lang]) ? 0 : matches.some(form => key(form) === q) ? 1 : 2;
    return [{
      id: entry.id, type: 'entry', title: entry[lang], body: entry[other],
      verified: true, page: 0, domain: entry.topic,
      _context: entry, _contextLanguage: lang, _contextMatch: matched,
      _contextKind: matchKind, _contextWords: key(matched).split(' ').length,
      _trusted: true, _gold: true,
      _wordCount: key(entry[lang]).split(' ').length,
      _matchedSenseIndex: -1,
      senses: entry.examples.map(example => ({
        label: 'Учебный параллельный пример', translation: entry[other],
        example: example[lang], exampleTranslation: example[other],
      })),
    }];
  }).sort((a, b) => a._contextKind - b._contextKind || b._contextWords - a._contextWords || b._contextMatch.length - a._contextMatch.length || a.id.localeCompare(b.id));
}

export function mergeContextResults(query, contextHits, dictionaryHits) {
  if (!contextHits.length) return dictionaryHits;
  const q = key(query);
  const grade = row => row._context ? row._contextKind :
    !row.verified && !row._gold ? 4 :
    key(row.title) === q ? 0 : row._exactRuKey || row._exactStem || row._malayBase ? 1 : 3;
  const merged = [...contextHits, ...dictionaryHits].map((row, order) => ({ row, order }));
  merged.sort((a, b) => grade(a.row) - grade(b.row) ||
    (b.row._contextWords || 0) - (a.row._contextWords || 0) || a.order - b.order);
  const seen = new Set();
  return merged.flatMap(({ row }) => {
    const id = `${key(row.title)}|${key(row.body)}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [row];
  });
}

const escapeContext = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));

export function highlightContext(text, expression) {
  // Preserve the original sentence and use Unicode boundaries, including ё/е.
  const escaped = String(expression).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[её]/gi, '[её]').replace(/\s+/g, '\\s+');
  if (!escaped) return escapeContext(text);
  const re = new RegExp(`(?<![\\p{L}\\p{N}-])${escaped}(?![\\p{L}\\p{N}-])`, 'giu');
  let html = '', last = 0;
  for (const match of String(text).matchAll(re)) {
    html += escapeContext(String(text).slice(last, match.index)) + '<mark>' + escapeContext(match[0]) + '</mark>';
    last = match.index + match[0].length;
  }
  return html + escapeContext(String(text).slice(last));
}
