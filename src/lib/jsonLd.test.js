import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from './jsonLd.js';

test('serializes CMS text without allowing an inline script breakout', () => {
  const value = {
    name: '</script><script>alert("stored xss")</script>',
    description: 'A & B\u2028C\u2029D',
  };

  const serialized = serializeJsonLd(value);

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.equal(serialized.includes('&'), false);
  assert.deepEqual(JSON.parse(serialized), value);
});
