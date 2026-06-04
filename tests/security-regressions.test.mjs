import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from '../src/lib/jsonLd.js';
import { getCollectionIdentity, slugify } from '../scripts/upload-photos.mjs';

test('serializeJsonLd escapes script-breaking characters', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.match(serialized, /A \\u0026 B \\u003e C/);
  assert.deepEqual(JSON.parse(serialized), {
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C',
  });
});

test('direct state-folder uploads use the state as collection identity', () => {
  assert.equal(slugify('.'), '');

  const identity = getCollectionIdentity('Macau', '.');

  assert.equal(identity.slug, 'macau');
  assert.equal(identity.displayCity, 'Macau');
  assert.equal(identity.locationInfo.country, 'China');
  assert.equal(identity.locationKey, 'macau');

  const unknown = getCollectionIdentity('Unknown State', '.');
  assert.equal(unknown.slug, 'unknown-state');
  assert.equal(unknown.displayCity, 'Unknown State');
  assert.equal(unknown.locationInfo, undefined);
});
