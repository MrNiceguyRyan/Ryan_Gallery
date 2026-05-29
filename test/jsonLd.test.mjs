import test from 'node:test';
import assert from 'node:assert/strict';

import { serializeJsonLd } from '../src/lib/jsonLd.js';

test('serializeJsonLd prevents script-tag breakout', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert(document.domain)</script>',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.deepEqual(JSON.parse(serialized), {
    name: '</script><script>alert(document.domain)</script>',
  });
});
