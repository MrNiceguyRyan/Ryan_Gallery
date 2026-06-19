import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from './jsonLd.js';

test('serializeJsonLd prevents script tag breakout', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert("xss")</script>',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('\\u003c/script>'), true);
  assert.deepEqual(JSON.parse(serialized), {
    name: '</script><script>alert("xss")</script>',
  });
});
