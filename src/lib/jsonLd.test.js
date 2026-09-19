import test from 'node:test';
import assert from 'node:assert/strict';

import { serializeJsonLd } from './jsonLd.js';

test('serializeJsonLd prevents script breakouts while preserving JSON data', () => {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name: '</script><script>alert("xss")</script>',
    description: 'Line\u2028separator and paragraph\u2029separator & marker',
  };

  const serialized = serializeJsonLd(payload);

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.match(serialized, /\\u0026 marker/);
  assert.deepEqual(JSON.parse(serialized), payload);
});
