import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from './jsonLd.js';

test('serializeJsonLd prevents script-tag breakout', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert("xss")</script>',
    description: 'Ryan & gallery',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003C\/script\\u003E/);
  assert.match(serialized, /Ryan \\u0026 gallery/);
});
