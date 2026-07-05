import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeJsonLd } from './jsonLd.js';

test('serializeJsonLd prevents closing the script tag', () => {
  const serialized = serializeJsonLd({
    name: 'Safe',
    description: '</script><script>alert("xss")</script>',
    extra: 'fish & chips > fries',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003C\/script\\u003E/);
  assert.match(serialized, /\\u0026/);
});
