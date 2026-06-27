import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeJsonLd } from './jsonLd.js';

test('serializeJsonLd prevents script tag breakout', () => {
  const serialized = serializeJsonLd({
    name: 'Safe name',
    description: '</script><script>window.pwned = true</script>',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.deepEqual(JSON.parse(serialized), {
    name: 'Safe name',
    description: '</script><script>window.pwned = true</script>',
  });
});

test('serializeJsonLd escapes HTML-significant characters without changing data', () => {
  const schema = {
    text: 'A < B && C > D',
    separator: '\u2028line\u2029paragraph',
  };
  const serialized = serializeJsonLd(schema);

  assert.equal(serialized.includes('<'), false);
  assert.equal(serialized.includes('>'), false);
  assert.equal(serialized.includes('&'), false);
  assert.deepEqual(JSON.parse(serialized), schema);
});
