import assert from 'node:assert/strict';
import { serializeJsonLd } from './jsonLd.js';

const serialized = serializeJsonLd({
  '@context': 'https://schema.org',
  name: 'Safe',
  description: '</script><script>alert("xss")</script>',
  lineSeparator: '\u2028',
  paragraphSeparator: '\u2029',
});

assert(!serialized.includes('</script>'));
assert(serialized.includes('\\u003c/script>'));
assert(serialized.includes('\\u2028'));
assert(serialized.includes('\\u2029'));
assert.deepEqual(JSON.parse(serialized), {
  '@context': 'https://schema.org',
  name: 'Safe',
  description: '</script><script>alert("xss")</script>',
  lineSeparator: '\u2028',
  paragraphSeparator: '\u2029',
});
