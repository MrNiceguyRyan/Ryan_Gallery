import test from 'node:test';
import assert from 'node:assert/strict';

import { serializeJsonLd } from './jsonLd.js';

test('serializeJsonLd escapes script-breaking characters', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert("xss")</script>',
    description: 'AT&T \u2028 line separator \u2029 paragraph separator',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.match(serialized, /AT\\u0026T/);
  assert.match(serialized, /\\u2028/);
  assert.match(serialized, /\\u2029/);
});
