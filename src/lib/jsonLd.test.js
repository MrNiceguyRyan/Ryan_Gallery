import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from './jsonLd.js';

test('serializeJsonLd prevents inline script breakouts while preserving data', () => {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name: '</script><script>alert("xss")</script><!--',
    caption: 'Ryan & friends \u2028 next line \u2029 paragraph',
  };

  const serialized = serializeJsonLd(schema);

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<!--'), false);
  assert.deepEqual(JSON.parse(serialized), schema);
});
