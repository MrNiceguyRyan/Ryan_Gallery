import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serializeJsonLd } from '../src/lib/jsonLd.js';

test('serializeJsonLd prevents script tag breakout', () => {
  const serialized = serializeJsonLd({
    description: '</script><script>alert("xss")</script>',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.match(serialized, /\\u003C\/script\\u003E/);
});

test('serializeJsonLd preserves parseable JSON-LD values', () => {
  const value = {
    name: 'Ryan & Gallery',
    lineSeparator: '\u2028',
  };

  assert.deepEqual(JSON.parse(serializeJsonLd(value)), value);
});
