import assert from 'node:assert/strict';
import { serializeJsonLd } from './jsonLd.js';

const lineSeparator = String.fromCharCode(0x2028);
const paragraphSeparator = String.fromCharCode(0x2029);

const payload = {
  '@context': 'https://schema.org',
  '@type': 'ImageGallery',
  name: '</script><script>alert("xss")</script>',
  description: `Line${lineSeparator}Paragraph${paragraphSeparator}`,
};

const serialized = serializeJsonLd(payload);

assert.equal(JSON.parse(serialized).name, payload.name);
assert.equal(JSON.parse(serialized).description, payload.description);
assert(!serialized.includes('</script>'));
assert(!serialized.includes('<script>'));
assert(!serialized.includes(lineSeparator));
assert(!serialized.includes(paragraphSeparator));
assert(serialized.includes('\\u003c/script>'));
assert(serialized.includes('\\u2028'));
assert(serialized.includes('\\u2029'));
