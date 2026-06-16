import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from '../src/lib/jsonLd.js';

test('serializeJsonLd prevents script breakout from CMS text', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C',
    separator: '\u2028\u2029',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u003e/);
  assert.match(serialized, /\\u2028\\u2029/);
  assert.deepEqual(JSON.parse(serialized), {
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C',
    separator: '\u2028\u2029',
  });
});
