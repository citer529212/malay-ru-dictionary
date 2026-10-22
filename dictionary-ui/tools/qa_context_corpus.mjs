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
assert.equal(contextCorpus.reduce((sum, row) => sum + row.examples.length, 0), 700);
const enriched = contextCorpus.filter(row => row.examples.length >= 2);
assert.equal(enriched.length, 200);
for (const row of enriched) {
  assert.equal(new Set(row.examples.map(example => key(example.ru))).size, row.examples.length);
  assert.equal(new Set(row.examples.map(example => key(example.ms))).size, row.examples.length);
  for (const example of row.examples) {
    assert.doesNotMatch(example.ru, /^Мы (?:говорим|обсуждаем)|^В статье упоминается/);
  }
}
const waterResults = searchContextCorpus(contextCorpus, 'вода');
assert.ok(waterResults.some(hit => hit.title === 'горячая вода' && hit._contextKind === 3));
assert.ok(searchContextCorpus(contextCorpus, 'воды').some(hit => hit.title === 'питьевая вода'));
assert.ok(searchContextCorpus(contextCorpus, 'air').some(hit => hit.title === 'air panas'));
assert.equal(searchContextCorpus(contextCorpus, 'водопровод').some(hit => hit.title === 'горячая вода'), false);
assert.equal(searchContextCorpus(contextCorpus, 'airborne').length, 0);
assert.equal(searchContextCorpus(contextCorpus, 'вода', 'ru-ms', {includeRelated:false,includeExamples:false}).length, 0);
assert.equal(searchContextCorpus(contextCorpus, 'вода', 'invalid').length, 0);
const topicResults = searchContextCorpus(contextCorpus, 'номер', 'ru-ms', {topic:'путешествия'});
assert.ok(topicResults.length > 0);
assert.ok(topicResults.every(hit => hit.domain === 'путешествия'));
assert.equal(searchContextCorpus(contextCorpus, 'номер комнаты', 'ru-ms', {topic:'одежда'}).length, 0);
assert.equal(contextCorpus.find(row => row.ru === 'администрация города').topic, 'документы и общество');
assert.equal(contextCorpus.find(row => row.ru === 'горный хребет').topic, 'природа');
const waterGold = {id:'gold-water',title:'вода',body:'air',verified:true};
assert.equal(mergeContextResults('вода',waterResults,[waterGold])[0].id,waterGold.id);
const waterForm = {...waterGold, _exactRuKey:true};
assert.equal(mergeContextResults('воды',searchContextCorpus(contextCorpus,'воды'),[waterForm])[0].id,waterForm.id);

const exampleSearches = [
  ['застрял', 'замочная скважина'], ['tersangkut', 'lubang kunci'],
  ['прошлой неделе', 'домашний интернет'], ['sejak semalam', 'internet rumah'],
  ['в раздевалке', 'форма команды'], ['bilik persalinan', 'jersi pasukan'],
];
for (const [query, expected] of exampleSearches) {
  const found = searchContextCorpus(contextCorpus, query);
  assert.ok(found.some(hit => hit.title === expected && hit._contextKind === 4), `Example lookup: ${query}`);
}
assert.equal(searchContextCorpus(contextCorpus, 'застрял', 'ru-ms', {includeExamples:false}).length, 0);
assert.equal(searchContextCorpus(contextCorpus, 'tersang').length, 0);
const reordered = searchContextCorpus(contextCorpus, 'Я забыл номер комнаты.')[0];
assert.equal(reordered.senses[0].contextExampleIndex, 1);
assert.equal(reordered.senses[0].example, 'Я забыл номер комнаты.');
const exampleHit = searchContextCorpus(contextCorpus, 'застрял');
const exactWord = {id:'exact-word',title:'застрял',body:'tersangkut',verified:true};
assert.equal(mergeContextResults('застрял',exampleHit,[exactWord])[0].id,exactWord.id);
assert.equal(mergeContextResults('застрял',exampleHit,[{...exactWord,id:'ocr-word',verified:false,type:'fulltext'}])[0].title,'замочная скважина');
assert.equal(highlightContext('<script>x</script> Ключ застрял в замочной скважине.','замочной скважине','застрял'),
  '&lt;script&gt;x&lt;/script&gt; Ключ <mark>застрял</mark> в <mark>замочной скважине</mark>.');
assert.equal(highlightContext('a+b (x)','a+b','(x)'),'<mark>a+b</mark> <mark>(x)</mark>');
assert.equal(highlightContext('air mineral','air mineral','air'),'<mark>air mineral</mark>');
assert.equal(highlightContext('airborne','air','borne'),'airborne');

const fixtures = read('./context-fixtures.json');
assert.equal(fixtures.length, 200);
for (const [ru, ms] of fixtures) {
  assert.equal(searchContextCorpus(contextCorpus, ru)[0].body, ms);
  assert.equal(searchContextCorpus(contextCorpus, ms)[0].body, ru);
  const ruWord = ru.split(" ")[0];
  const msWord = ms.split(" ")[0];
  assert.ok(searchContextCorpus(contextCorpus, ruWord).some(hit => hit.title === ru && hit.body === ms), `Related Russian: ${ruWord} → ${ru}`);
  assert.ok(searchContextCorpus(contextCorpus, msWord).some(hit => hit.title === ms && hit.body === ru), `Related Malay: ${msWord} → ${ms}`);
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
console.log(JSON.stringify({expressions:contextCorpus.length,examples:contextCorpus.reduce((n,r)=>n+r.examples.length,0),exact,forms,contexts,fixedFixturesPerDirection:fixtures.length,relatedFixturesPerDirection:fixtures.length,protectedFiles,enrichedExpressions:enriched.length,relatedSearchAndTopics:'passed',exampleSearchAndOrdering:'passed',rankingAndSafety:'passed'},null,2));
