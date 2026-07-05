import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const files = {
  upload: readFileSync(new URL('./upload-photos.mjs', import.meta.url), 'utf8'),
  backfill: readFileSync(new URL('./backfill-region.mjs', import.meta.url), 'utf8'),
  cleanup: readFileSync(new URL('./cleanup-collections.mjs', import.meta.url), 'utf8'),
  layout: readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8'),
};

test('Sanity mutation scripts do not contain checked-in write tokens or fallbacks', () => {
  for (const [name, source] of Object.entries({
    upload: files.upload,
    backfill: files.backfill,
    cleanup: files.cleanup,
  })) {
    assert.equal(/\bsk[A-Za-z0-9_.-]{20,}/.test(source), false, `${name} contains a Sanity token literal`);
    assert.equal(/process\.env\.SANITY_TOKEN\s*\|\|/.test(source), false, `${name} falls back from SANITY_TOKEN`);
    assert.match(source, /const SANITY_TOKEN = process\.env\.SANITY_TOKEN;/, `${name} reads SANITY_TOKEN from env`);
  }
});

test('direct state-folder uploads use state name for CMS collection metadata', () => {
  assert.match(files.upload, /uploadCity\(stateName,\s*'\.',\s*stateName\)/);
  assert.match(files.upload, /findOrCreateCollection\(collectionName,\s*stateName\)/);
  assert.doesNotMatch(files.upload, /findOrCreateCollection\(cityFolderName,\s*stateName\)/);
});

test('empty collection deletion requires an explicit id allowlist', () => {
  assert.match(files.cleanup, /const DELETE_IDS = new Set/);
  assert.match(files.cleanup, /DELETE_EMPTY && DELETE_IDS\.size === 0/);
  assert.match(files.cleanup, /DELETE_IDS\.has\(c\._id\)/);
});

test('Layout uses escaped JSON-LD serialization before set:html', () => {
  assert.match(files.layout, /import \{ serializeJsonLd \} from '\.\.\/lib\/jsonLd\.js';/);
  assert.match(files.layout, /set:html=\{serializeJsonLd\(schema\)\}/);
  assert.doesNotMatch(files.layout, /set:html=\{JSON\.stringify\(schema\)\}/);
});
