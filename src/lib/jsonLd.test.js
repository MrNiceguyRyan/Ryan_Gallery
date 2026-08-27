import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from './jsonLd.js';

test('serializeJsonLd escapes characters that can break out of a script tag', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C',
    lineSeparators: '\u2028\u2029',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003C\/script\\u003E/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u003E/);
  assert.match(serialized, /\\u2028\\u2029/);
  assert.deepEqual(JSON.parse(serialized), {
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C',
    lineSeparators: '\u2028\u2029',
  });
});
