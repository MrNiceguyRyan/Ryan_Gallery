import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serializeJsonLd } from '../src/lib/jsonLd.js';

test('serializeJsonLd escapes script-breaking CMS content', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert("xss")</script>',
    description: 'A & B <!-- comment -->',
  });

  assert.doesNotMatch(serialized, /<\/script/i);
  assert.doesNotMatch(serialized, /<!--/);
  assert.match(serialized, /\\u003C\/script\\u003E/);
  assert.match(serialized, /\\u0026/);
});
