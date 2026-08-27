import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from '../src/lib/jsonLd.js';

test('serializeJsonLd preserves JSON while escaping script-breaking characters', () => {
  const payload = {
    '@context': 'https://schema.org',
    name: '</script><script>alert(1)</script>',
    description: 'A & B > C',
  };

  const serialized = serializeJsonLd(payload);

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.equal(serialized.includes('&'), false);
  assert.deepEqual(JSON.parse(serialized), payload);
});
