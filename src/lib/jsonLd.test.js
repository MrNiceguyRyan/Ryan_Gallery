import assert from 'node:assert/strict';
import { serializeJsonLd } from './jsonLd.js';

const breakout = serializeJsonLd({
  description: '</script><img src=x onerror=alert(1)>',
});
assert.equal(breakout.includes('</script>'), false);
assert.equal(breakout.includes('\\u003c/script\\u003e'), true);

const comment = serializeJsonLd({ note: '<!--' });
assert.equal(comment.includes('<!--'), false);
assert.equal(comment.includes('\\u003c!--'), true);

const amp = serializeJsonLd({ a: 'a & b' });
assert.equal(amp.includes('&'), false);
assert.equal(amp.includes('\\u0026'), true);

// Round-trip: escaped form still parses to the original value.
const original = {
  name: 'Zion',
  description: '</script><script>alert(1)</script>',
};
assert.deepEqual(JSON.parse(serializeJsonLd(original)), original);

console.log('jsonLd.test.js: ok');
