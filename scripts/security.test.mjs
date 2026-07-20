import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const mutationScripts = [
  './upload-photos.mjs',
  './backfill-region.mjs',
  './cleanup-collections.mjs',
];

test('Sanity mutation scripts require an environment write token', () => {
  for (const path of mutationScripts) {
    const source = read(path);
    assert.match(source, /const SANITY_TOKEN = process\.env\.SANITY_TOKEN;/, path);
    assert.doesNotMatch(source, /process\.env\.SANITY_TOKEN\s*\|\|/, path);
    assert.doesNotMatch(source, /sk[A-Za-z0-9]{20,}/, path);
  }
});

test('flat state folders use the state name for collection metadata', () => {
  const source = read('./upload-photos.mjs');
  assert.match(source, /uploadCity\(stateName, '\.', stateName\)/);
});

test('empty collection deletion is restricted to explicit IDs', () => {
  const source = read('./cleanup-collections.mjs');
  assert.match(source, /DELETE_EMPTY && DELETE_IDS\.size === 0/);
  assert.match(source, /if \(!DELETE_IDS\.has\(c\._id\)\) continue;/);
});
