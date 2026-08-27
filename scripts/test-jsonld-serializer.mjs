import assert from 'node:assert/strict';

import { serializeJsonLd } from '../src/lib/jsonLd.js';

const maliciousSchema = {
  '@context': 'https://schema.org',
  '@type': 'ImageGallery',
  description: '</script><script>alert(document.domain)</script><!--',
  image: [
    {
      '@type': 'ImageObject',
      name: 'safe title',
    },
  ],
};

const serialized = serializeJsonLd(maliciousSchema);

assert.equal(
  serialized.toLowerCase().includes('</script'),
  false,
  'serialized JSON-LD must not contain a literal closing script tag',
);
assert.equal(
  serialized.includes('<!--'),
  false,
  'serialized JSON-LD must not contain a literal HTML comment opener',
);
assert.deepEqual(JSON.parse(serialized), maliciousSchema);

console.log('JSON-LD serialization is safe for script embedding.');
