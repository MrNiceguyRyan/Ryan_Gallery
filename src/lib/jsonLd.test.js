import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serializeJsonLd } from './jsonLd.js';

test('serializeJsonLd escapes script-breaking and HTML-sensitive characters', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C',
    lineSeparators: 'first\u2028second\u2029third',
  });

  assert.doesNotMatch(serialized, /<\/script/i);
  assert.doesNotMatch(serialized, /<script/i);
  assert.doesNotMatch(serialized, /[<>&]/);
  assert.match(serialized, /\\u003C\/script\\u003E/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u2028/);
  assert.match(serialized, /\\u2029/);
  assert.deepEqual(JSON.parse(serialized), {
    name: '</script><script>alert("xss")</script>',
    description: 'A & B > C',
    lineSeparators: 'first\u2028second\u2029third',
  });
});
