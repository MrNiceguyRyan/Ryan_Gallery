import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from '../src/lib/jsonLd.js';

test('serializeJsonLd prevents script-tag breakout from CMS text', () => {
  const serialized = serializeJsonLd({
    '@context': 'https://schema.org',
    name: '</script><script>alert("xss")</script>',
    description: 'safe & sound',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003C\/script\\u003E/);
  assert.match(serialized, /\\u0026/);
  assert.deepEqual(JSON.parse(serialized), {
    '@context': 'https://schema.org',
    name: '</script><script>alert("xss")</script>',
    description: 'safe & sound',
  });
});
