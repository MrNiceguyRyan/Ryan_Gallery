import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const mutationScripts = [
  './upload-photos.mjs',
  './backfill-region.mjs',
  './cleanup-collections.mjs',
];

test('Sanity mutation scripts require SANITY_TOKEN from the environment', () => {
  for (const path of mutationScripts) {
    const source = read(path);

    assert.doesNotMatch(source, /sk[0-9A-Za-z_-]{20,}/, `${path} must not contain a checked-in Sanity token`);
    assert.doesNotMatch(source, /process\.env\.SANITY_TOKEN\s*\|\|/, `${path} must not fall back from SANITY_TOKEN`);
    assert.match(source, /const SANITY_TOKEN = process\.env\.SANITY_TOKEN;/, `${path} should read SANITY_TOKEN directly`);
    assert.match(source, /Missing SANITY_TOKEN/, `${path} should fail closed when SANITY_TOKEN is absent`);
  }
});

test('environment example documents SANITY_TOKEN without a token value', () => {
  const source = read('../.env.example');

  assert.match(source, /SANITY_TOKEN=/);
  assert.doesNotMatch(source, /sk[0-9A-Za-z_-]{20,}/);
});

test('JSON-LD scripts use the escaping serializer before set:html', () => {
  const layout = read('../src/layouts/Layout.astro');

  assert.match(layout, /serializeJsonLd\(schema\)/);
  assert.doesNotMatch(layout, /set:html=\{JSON\.stringify/);
});

test('direct state-folder uploads use the state name for collection metadata', () => {
  const source = read('./upload-photos.mjs');

  assert.match(source, /cityFolderName === '\.' \? stateName : cityFolderName/);
  assert.match(source, /await uploadCity\(stateName, '\.'\)/);
  assert.doesNotMatch(source, /slugify\(cityFolderName\)/);
});

test('empty collection cleanup requires explicit ids before deleting', () => {
  const source = read('./cleanup-collections.mjs');
  const deleteIndex = source.indexOf('await sanity.delete(c._id)');
  const guardIndex = source.lastIndexOf('DELETE_IDS.has(c._id)', deleteIndex);

  assert.ok(deleteIndex > -1, 'cleanup script should still support targeted deletes');
  assert.ok(guardIndex > -1, 'delete should be guarded by explicit DELETE_IDS membership');
  assert.match(source, /DELETE_IDS\.size === 0/);
  assert.match(source, /--ids=<collectionId,\.\.\.>/);
});

test('map selection expands the same fine-grained region used for grouping', () => {
  const source = read('../src/components/MapboxMap.tsx');

  assert.match(source, /function regionForCluster\(cluster: LocationCluster\): string/);
  assert.match(source, /cluster\.region \|\| getRegion\(cluster\.country\)/);
  assert.doesNotMatch(source, /setExpandedRegion\(getRegion\(/);
});
