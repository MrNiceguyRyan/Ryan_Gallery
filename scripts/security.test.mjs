import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Sanity write scripts do not contain committed tokens or fallbacks', () => {
  for (const path of [
    'scripts/upload-photos.mjs',
    'scripts/backfill-region.mjs',
    'scripts/cleanup-collections.mjs',
  ]) {
    const source = read(path);

    assert.doesNotMatch(source, /sk[A-Za-z0-9]{20,}/, `${path} must not contain a Sanity token`);
    assert.doesNotMatch(source, /process\.env\.SANITY_TOKEN\s*\|\|/, `${path} must not fall back to a committed token`);
    assert.match(source, /const SANITY_TOKEN = process\.env\.SANITY_TOKEN;/, `${path} must read SANITY_TOKEN from env`);
    assert.match(source, /Missing SANITY_TOKEN/, `${path} must fail closed when SANITY_TOKEN is absent`);
  }
});

test('Layout uses safe JSON-LD serialization for raw script output', () => {
  const source = read('src/layouts/Layout.astro');

  assert.match(source, /import \{ stringifyJsonLd \} from '\.\.\/lib\/jsonLd\.js';/);
  assert.match(source, /set:html=\{stringifyJsonLd\(schema\)\}/);
  assert.doesNotMatch(source, /set:html=\{JSON\.stringify\(schema\)\}/);
});

test('direct state-folder uploads use the state name for collection metadata', () => {
  const source = read('scripts/upload-photos.mjs');

  assert.match(source, /const collectionName = cityFolderName === '\.' \? stateName : cityFolderName;/);
  assert.match(source, /findOrCreateCollection\(collectionName, stateName\)/);
  assert.match(source, /generateTitle\(collectionName, stateName,/);
});

test('cleanup script refuses broad empty-collection deletion', () => {
  const source = read('scripts/cleanup-collections.mjs');

  assert.match(source, /Refusing to delete all empty collections/);
  assert.match(source, /DELETE_EMPTY_TARGETS\.has\(normalizeTarget\(c\.name\)\)/);
  assert.match(source, /DELETE_EMPTY_TARGETS\.has\(normalizeTarget\(c\._id\)\)/);
});
