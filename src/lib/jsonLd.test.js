import assert from 'node:assert/strict';
import { serializeJsonLd } from './jsonLd.js';

const payload = {
  name: '</script><script>globalThis.__xss = true</script>',
  text: 'safe & sound > quiet',
  separators: 'line\u2028paragraph\u2029done',
};

const serialized = serializeJsonLd(payload);

assert.doesNotMatch(serialized, /</, 'JSON-LD must not contain raw "<" characters');
assert.doesNotMatch(serialized, />/, 'JSON-LD must not contain raw ">" characters');
assert.doesNotMatch(serialized, /&/, 'JSON-LD must not contain raw ampersands');
assert.doesNotMatch(serialized, /\u2028|\u2029/, 'JSON-LD must escape JavaScript line separators');
assert.deepEqual(JSON.parse(serialized), payload, 'Escaped JSON-LD must preserve the original data');
