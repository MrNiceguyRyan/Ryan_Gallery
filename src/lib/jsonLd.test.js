import assert from 'node:assert/strict';
import { serializeJsonLd } from './jsonLd.js';

const payload = {
  name: 'safe </script><script>alert(1)</script>',
  description: 'A & B \u2028 line \u2029 paragraph',
};

const serialized = serializeJsonLd(payload);

assert.equal(serialized.includes('</script>'), false);
assert.equal(serialized.includes('<script>'), false);
assert.match(serialized, /\\u003C\/script\\u003E/);
assert.match(serialized, /\\u0026/);
assert.deepEqual(JSON.parse(serialized), payload);
