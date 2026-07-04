'use strict';

const assert = require('assert');
const core = require('../search-core.js');

const entries = core.prepareEntries([
  ['ёлка', 'pokok cemara'],
  ['дом', 'rumah'],
  ['домашний адрес', 'alamat rumah'],
  ['много', 'banyak'],
  ['air', 'вода'],
  ['air terjun', 'водопад'],
], 'ru-ms');

assert.strictEqual(core.normalizeText('  Ёлка  ', 'ru-ms'), 'елка');
assert.strictEqual(core.searchEntries(entries, 'елка', 'ru-ms').results[0].title, 'ёлка');
assert.strictEqual(core.searchEntries(entries, 'дом', 'ru-ms').results[0].title, 'дом');
assert.strictEqual(core.searchEntries(entries, 'адрес', 'ru-ms').results[0].title, 'домашний адрес');
assert.strictEqual(core.searchEntries(entries, 'banyak', 'ru-ms').results[0].title, 'много');

const msEntries = core.prepareEntries([
  ['air', 'вода'],
  ['air mata', 'слёзы'],
  ['besar', 'большой'],
], 'ms-ru');
assert.strictEqual(core.searchEntries(msEntries, 'air', 'ms-ru').results[0].title, 'air');
assert.strictEqual(core.searchEntries(msEntries, 'больш', 'ms-ru').results[0].title, 'besar');
console.log('search-core tests passed');
