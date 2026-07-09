import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Sanity write scripts require SANITY_TOKEN without committed fallbacks', () => {
  for (const path of [
    'scripts/upload-photos.mjs',
    'scripts/backfill-region.mjs',
    'scripts/cleanup-collections.mjs',
  ]) {
    const source = read(path);

    assert.doesNotMatch(source, /process\.env\.SANITY_TOKEN\s*\|\|/);
    assert.doesNotMatch(source, /sk[A-Za-z0-9]{20,}/);
    assert.match(source, /const SANITY_TOKEN = process\.env\.SANITY_TOKEN;/);
    assert.match(source, /Missing SANITY_TOKEN/);
  }
});

test('direct state-folder uploads keep filesystem path separate from CMS metadata', () => {
  const source = read('scripts/upload-photos.mjs');

  assert.match(source, /async function uploadCity\(stateName, cityFolderName, collectionName = cityFolderName\)/);
  assert.match(source, /const cityPath = join\(PHOTO_ROOT, stateName, cityFolderName\);/);
  assert.match(source, /await uploadCity\(stateName, '\.', stateName\);/);
  assert.doesNotMatch(source, /await uploadCity\(stateName, '\.'\);/);
  assert.match(source, /Refusing to create a collection with an empty slug/);
});

test('JSON-LD script injection uses hardened serialization', () => {
  const layout = read('src/layouts/Layout.astro');

  assert.match(layout, /import \{ serializeJsonLd \} from '\.\.\/lib\/jsonLd\.js';/);
  assert.match(layout, /set:html=\{serializeJsonLd\(schema\)\}/);
  assert.doesNotMatch(layout, /set:html=\{JSON\.stringify\(schema\)\}/);
});

test('map marker and hash selection expand the grouped collection region', () => {
  const source = read('src/components/MapboxMap.tsx');

  assert.match(source, /function resolveClusterRegion\(cluster: LocationCluster\): string/);
  assert.match(source, /setExpandedRegion\(resolveClusterRegion\(cluster\)\);/);
  assert.match(source, /setExpandedRegion\(resolveClusterRegion\(closest\)\);/);
  assert.doesNotMatch(source, /setExpandedRegion\(getRegion\((cluster|closest)\.country\)\);/);
});
