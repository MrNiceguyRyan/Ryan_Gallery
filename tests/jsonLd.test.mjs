import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeJsonLd } from '../src/lib/jsonLd.js';

test('serializeJsonLd prevents inline script breakout', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003C\/script\\u003E/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u003E/);
  assert.deepEqual(JSON.parse(serialized), {
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C',
  });
});
