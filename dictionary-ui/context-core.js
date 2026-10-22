import { normalizeHeadwordLoose, directionForQuery } from './search-core.js?v=4';

const key = normalizeHeadwordLoose;
const contained = (text, phrase) => (` ${text} `).includes(` ${phrase} `);
const contextIndexes = new WeakMap();

function contextIndex(corpus, lang) {
  let indexes = contextIndexes.get(corpus);
  if (!indexes) {
    indexes = new Map();
    contextIndexes.set(corpus, indexes);
  }
  if (!indexes.has(lang)) {
    indexes.set(lang, corpus.map(entry => ({
      entry, head: key(entry[lang]),
      examples: entry.examples.map((example, index) => ({index, normalized:key(example[lang])})),
      forms: [...new Set([entry[lang], ...(entry.forms[lang] || [])])]
        .map(text => ({text, normalized:key(text)}))
        .sort((a, b) => b.normalized.split(' ').length - a.normalized.split(' ').length || b.text.length - a.text.length),
    })));
  }
  return indexes.get(lang);
}

// Only explicit, reviewed forms are accepted; heuristic stemming cannot invent a phrase.
export function searchContextCorpus(corpus, query, direction = directionForQuery(query), options = {}) {
  if (!['ru-ms', 'ms-ru'].includes(direction) || !key(query)) return [];
  const lang = direction === 'ru-ms' ? 'ru' : 'ms';
  const other = lang === 'ru' ? 'ms' : 'ru';
  const q = key(query);
  return contextIndex(corpus, lang).flatMap(({entry, head, forms, examples}) => {
    if (!entry.verified || (options.topic && entry.topic !== options.topic)) return [];
    const matches = forms.filter(form => contained(q, form.normalized));
    const related = !matches.length && options.includeRelated !== false && forms.some(form => contained(form.normalized, q));
    const matchedExamples = options.includeExamples !== false && q.replaceAll(' ', '').length >= 3
      ? examples.filter(example => contained(example.normalized, q)).map(example => example.index) : [];
    if (!matches.length && !related && !matchedExamples.length) return [];
    const matched = matches[0]?.text || entry[lang];
    const matchKind = q === head ? 0 : matches.some(form => form.normalized === q) ? 1 : matches.length ? 2 : related ? 3 : 4;
    const exampleIndexes = [...matchedExamples, ...examples.map(example => example.index).filter(index => !matchedExamples.includes(index))];
    return [{
      id: entry.id, type: 'entry', title: entry[lang], body: entry[other],
      verified: true, page: 0, domain: entry.topic,
      _context: entry, _contextLanguage: lang, _contextMatch: matched,
      _contextKind: matchKind, _contextExampleIndexes: exampleIndexes, _contextWords: key(matched).split(' ').length,
      _trusted: true, _gold: true,
      _wordCount: key(entry[lang]).split(' ').length,
      _matchedSenseIndex: -1,
      senses: exampleIndexes.map(index => ({
        label: 'Учебный параллельный пример', translation: entry[other],
        example: entry.examples[index][lang], exampleTranslation: entry.examples[index][other],
        contextExampleIndex: index,
      })),
    }];
  }).sort((a, b) => a._contextKind - b._contextKind || b._contextWords - a._contextWords || b._contextMatch.length - a._contextMatch.length || a.id.localeCompare(b.id));
}

export function mergeContextResults(query, contextHits, dictionaryHits) {
  if (!contextHits.length) return dictionaryHits;
  const q = key(query);
  const grade = row => row._context ? row._contextKind :
    !row.verified && !row._gold ? 5 :
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

export function highlightContext(text, expression, query = '') {
  // Escape each literal before constructing a Unicode-aware pattern. Longer spans win.
  const literals = [...new Set([expression, query].filter(Boolean).map(String))]
    .sort((a, b) => b.length - a.length);
  const escaped = literals.map(literal => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[её]/gi, '[её]').replace(/\s+/g, '\\s+')).join('|');
  if (!escaped) return escapeContext(text);
  const re = new RegExp(`(?<![\\p{L}\\p{N}-])(?:${escaped})(?![\\p{L}\\p{N}-])`, 'giu');
  let html = '', last = 0;
  for (const match of String(text).matchAll(re)) {
    html += escapeContext(String(text).slice(last, match.index)) + '<mark>' + escapeContext(match[0]) + '</mark>';
    last = match.index + match[0].length;
  }
  return html + escapeContext(String(text).slice(last));
}
