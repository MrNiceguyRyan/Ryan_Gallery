import assert from 'node:assert/strict';
import test from 'node:test';
import { stringifyJsonLd } from './jsonLd.js';

test('stringifyJsonLd escapes script-breaking characters without changing data', () => {
  const value = {
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C < D',
    separators: '\u2028\u2029',
  };

  const serialized = stringifyJsonLd(value);

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003C\/script\\u003E/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u2028\\u2029/);
  assert.deepEqual(JSON.parse(serialized), value);
});
