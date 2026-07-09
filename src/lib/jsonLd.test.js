import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeJsonLd } from './jsonLd.js';

test('serializeJsonLd escapes script-breaking characters while preserving JSON data', () => {
  const schema = {
    '@context': 'https://schema.org',
    name: '</script><script>alert(1)</script>',
    description: 'line\u2028separator & tag <b>',
  };

  const serialized = serializeJsonLd(schema);

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.equal(serialized.includes('\u2028'), false);
  assert.equal(serialized.includes('&'), false);
  assert.deepEqual(JSON.parse(serialized), schema);
});
