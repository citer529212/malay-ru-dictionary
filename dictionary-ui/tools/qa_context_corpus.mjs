import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { contextCorpus } from '../data/context-corpus.js';
import { searchContextCorpus, mergeContextResults, highlightContext } from '../context-core.js';
import { directionForQuery, normalizeHeadwordLoose as key } from '../search-core.js';
const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const gold = read('../data/dictionary_ru_ms_gold.json').entries;
const baseline = read('./context-baseline.json');
let protectedFiles = 0;
for (const [file, hash] of Object.entries(baseline)) {
  if (!file.startsWith('data/')) continue;
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../'+file, import.meta.url))).digest('hex'), hash, `Existing database changed: ${file}`);
  protectedFiles++;
}
assert.equal(contextCorpus.length, 500);
assert.equal(new Set(contextCorpus.map(r => r.id)).size, 500);
assert.equal(new Set(contextCorpus.map(r => key(r.ru))).size, 500);
assert.equal(new Set(contextCorpus.map(r => key(r.ms))).size, 500);
let exact = 0, forms = 0, contexts = 0;
for (const row of contextCorpus) {
  assert.equal(row.verified, true);
  assert.ok(row.topic);
  assert.ok(row.ru.split(' ').length >= 2);
  assert.ok(row.forms.ru.length >= 3);
  assert.deepEqual(row.forms.ms, [row.ms]); // Malay nominals are invariant in case.
  const original = gold.find(g => g.id === row.verification.sourceEntryId);
  assert.ok(original?.verified);
  assert.equal(row.ru, original.title);
  assert.equal(row.ms, original.body);
  assert.equal(row.verification.basis, 'provided_verified_gold');
  for (const lang of ['ru','ms']) {
    const direction = lang === 'ru' ? 'ru-ms' : 'ms-ru';
    assert.equal(directionForQuery(row[lang]), direction);
    const results = searchContextCorpus(contextCorpus, row[lang]);
    assert.equal(results[0].id, row.id, `Exact ${lang}: ${row[lang]}`);
    assert.equal(results[0]._contextKind, 0);
    exact++;
    for (const form of row.forms[lang]) {
      const found = searchContextCorpus(contextCorpus, form, direction);
      assert.equal(found[0]?.id, row.id, `Form ${form}`);
      forms++;
    }
    assert.ok(row.examples.length >= 1);
    for (const example of row.examples) {
      assert.equal(example.origin, 'original_teaching_example');
      assert.ok(row.forms[lang].includes(example[lang+'Expression']));
      const marked = highlightContext(example[lang], example[lang+'Expression']);
      assert.ok(marked.includes('<mark>'), `Missing highlight: ${example[lang]}`);
      assert.equal(marked.replaceAll('<mark>','').replaceAll('</mark>',''), example[lang]);
      assert.ok(searchContextCorpus(contextCorpus, example[lang], direction).some(hit => hit.id === row.id));
      contexts++;
    }
  }
}
const fixtures = read('./context-fixtures.json');
assert.ok(fixtures.length >= 100);
for (const [ru, ms] of fixtures) {
  assert.equal(searchContextCorpus(contextCorpus, ru)[0].body, ms);
  assert.equal(searchContextCorpus(contextCorpus, ms)[0].body, ru);
}
// Independent ranking, token boundaries, false positives and HTML-safety checks.
const phrase = contextCorpus.find(r => r.ru === 'номер комнаты');
const short = {...phrase, id:'short', ru:'номер', ms:'nombor', forms:{ru:['номер'],ms:['nombor']}};
const long = {...phrase, id:'long', ru:'номер комнаты отеля', ms:'nombor bilik hotel', forms:{ru:['номер комнаты отеля'],ms:['nombor bilik hotel']}};
for (const [query, dir] of [['Укажите номер комнаты отеля, пожалуйста.','ru-ms'],['Tulis nombor bilik hotel itu.','ms-ru']]) {
  assert.equal(searchContextCorpus([short,phrase,long],query,dir)[0].id, 'long');
}
const hits=searchContextCorpus(contextCorpus,'номер комнаты');
const noisy=[{id:'word',title:'номер',body:'nombor',verified:true},{id:'ocr',title:'номер комнаты OCR',body:'noise',type:'fulltext'}];
assert.equal(mergeContextResults('номер комнаты',hits,noisy)[0].id,phrase.id);
const embedded = searchContextCorpus(contextCorpus,'Укажите номер комнаты');
assert.equal(mergeContextResults('Укажите номер комнаты',embedded,[{id:'ocr-exact',title:'Укажите номер комнаты',body:'OCR',verified:false,type:'fulltext'}])[0].id,phrase.id);
assert.equal(mergeContextResults('без совпадений',[],noisy),noisy);
const exactGold={id:'long-gold', title:'укажите номер комнаты',body:'nyatakan nombor bilik',verified:true};
assert.equal(mergeContextResults(exactGold.title,searchContextCorpus(contextCorpus,exactGold.title),[exactGold])[0].id,exactGold.id);
assert.equal(searchContextCorpus(contextCorpus,'комнатушкиномер комнаты').length,0);
assert.equal(searchContextCorpus(contextCorpus,'nombor bilikku').some(h=>h.id===phrase.id),false);
assert.equal(searchContextCorpus(contextCorpus,'qzxw qzxw').length,0);
assert.equal(searchContextCorpus(contextCorpus,'').length,0);
assert.equal(searchContextCorpus([{...phrase,verified:false}],'номер комнаты').length,0);
assert.equal(searchContextCorpus(contextCorpus,' НОМЕР, КОМНАТЫ! ')[0].id,phrase.id);
assert.equal(highlightContext('berus gigitan','berus gigi'),'berus gigitan');
assert.equal(highlightContext('<script>x</script> air mineral','air mineral'),'&lt;script&gt;x&lt;/script&gt; <mark>air mineral</mark>');
assert.equal(highlightContext('Зубная щётка','зубная щетка'),'<mark>Зубная щётка</mark>');
console.log(JSON.stringify({expressions:contextCorpus.length,examples:contextCorpus.reduce((n,r)=>n+r.examples.length,0),exact,forms,contexts,fixedFixturesPerDirection:fixtures.length,protectedFiles,rankingAndSafety:'passed'},null,2));
