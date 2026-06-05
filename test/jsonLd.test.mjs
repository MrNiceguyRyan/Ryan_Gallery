import assert from 'node:assert/strict';
import test from 'node:test';

import { getDirectStateUploadTarget } from '../scripts/upload-photos.mjs';
import { serializeJsonLd } from '../src/lib/jsonLd.js';

test('serializeJsonLd prevents script-tag breakout from CMS strings', () => {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: '</script><script>globalThis.pwned = true</script>',
    description: 'Ryan & friends \u2028 collection',
  };

  const serialized = serializeJsonLd(payload);

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.equal(serialized.includes('&'), false);
  assert.deepEqual(JSON.parse(serialized), payload);
});

test('direct state photo folders upload under the state collection name', () => {
  const target = getDirectStateUploadTarget('Macau', '/Users/ryan/Desktop/PHOTO/Macau');

  assert.equal(target.cityFolderName, 'Macau');
  assert.deepEqual(target.options, { cityPath: '/Users/ryan/Desktop/PHOTO/Macau' });
});
