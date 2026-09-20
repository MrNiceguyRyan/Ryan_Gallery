import assert from 'node:assert/strict';
import { serializeJsonLd } from './jsonLd.js';

const payload = {
  name: '</script><script>alert("xss")</script>',
  description: 'A & B > C',
  separator: '\u2028\u2029',
};

const serialized = serializeJsonLd(payload);

assert.doesNotMatch(serialized, /<\/script/i);
assert.match(serialized, /\\u003c\/script\\u003e/i);
assert.match(serialized, /\\u0026/);
assert.deepEqual(JSON.parse(serialized), payload);
