import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { serializeJsonLd } from '../src/lib/jsonLd.js';
import { getUploadContext, slugify } from '../scripts/upload-photos.mjs';

test('serializeJsonLd prevents script tag breakout while preserving data', () => {
  const dangerousTitle = '</script><script>alert(document.domain)</script>';
  const serialized = serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name: dangerousTitle,
    caption: 'A & B > C',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003C\/script\\u003E/);
  assert.match(serialized, /\\u0026/);
  assert.deepEqual(JSON.parse(serialized), {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name: dangerousTitle,
    caption: 'A & B > C',
  });
});

test('upload script does not contain a committed Sanity write token', async () => {
  const source = await readFile(new URL('../scripts/upload-photos.mjs', import.meta.url), 'utf8');

  assert.match(source, /process\.env\.SANITY_TOKEN/);
  assert.doesNotMatch(source, /sk[A-Za-z0-9]{40,}/);
});

test('flat state-folder uploads use the state name for collection and location', () => {
  assert.equal(slugify('Macau'), 'macau');

  const context = getUploadContext('Macau', 'Macau', {
    cityPath: '/Users/ryan/Desktop/PHOTO/Macau',
    collectionName: 'Macau',
    locationKey: 'Macau',
  });

  assert.equal(context.cityPath, '/Users/ryan/Desktop/PHOTO/Macau');
  assert.equal(context.collectionName, 'Macau');
  assert.equal(context.locationInfo.city, 'Macau');
  assert.equal(context.stateStyle, 'street');
});
