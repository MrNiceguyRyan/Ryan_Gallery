import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from '../src/lib/jsonLd.js';

test('serializeJsonLd prevents script-tag breakout while preserving data', () => {
  const payload = {
    name: '</script><script>alert("xss")</script>',
    description: 'Line separator\u2028paragraph separator\u2029 & markup <b>',
  };

  const serialized = serializeJsonLd(payload);

  assert.doesNotMatch(serialized, /<\/script/i);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(serialized), payload);
});
