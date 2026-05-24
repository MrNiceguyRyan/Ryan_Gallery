import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serializeJsonLd } from '../src/lib/jsonLd.js';

test('serializeJsonLd preserves data while blocking script breakouts', () => {
  const payload = {
    name: '</script><script>alert("xss")</script>',
    description: 'Ryan & gallery \u2028 line \u2029 separator',
  };

  const serialized = serializeJsonLd(payload);

  assert.equal(JSON.parse(serialized).name, payload.name);
  assert.equal(JSON.parse(serialized).description, payload.description);
  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003C\/script\\u003E/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u2028/);
  assert.match(serialized, /\\u2029/);
});
