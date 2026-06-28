import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { serializeJsonLd } from '../src/lib/jsonLd.js';

const root = new URL('..', import.meta.url).pathname;

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('JSON-LD serialization cannot break out of the script tag', () => {
  const serialized = serializeJsonLd({
    name: '</script><script>alert("xss")</script>',
    description: 'Fish & chips > stale markup',
  });

  assert.equal(serialized.includes('</script>'), false);
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u003e/);
});

test('Layout uses the safe JSON-LD serializer', () => {
  const layout = read('src/layouts/Layout.astro');

  assert.match(layout, /serializeJsonLd\(schema\)/);
  assert.doesNotMatch(layout, /set:html=\{JSON\.stringify\(schema\)\}/);
});

test('Sanity maintenance scripts do not contain committed write tokens', () => {
  const scriptsDir = join(root, 'scripts');
  const scripts = readdirSync(scriptsDir).filter((name) => name.endsWith('.mjs'));

  for (const script of scripts) {
    const source = read(join('scripts', script));
    assert.doesNotMatch(source, /sk[A-Za-z0-9]{20,}/, `${script} contains a Sanity-looking token`);
    assert.doesNotMatch(source, /token:\s*['"`]/, `${script} passes a literal token to Sanity`);
  }
});

test('cleanup deletes only explicitly targeted empty collections', () => {
  const source = read('scripts/cleanup-collections.mjs');

  assert.match(source, /--id=/);
  assert.match(source, /--slug=/);
  assert.match(source, /Refusing to delete all empty collections/);
  assert.match(source, /DELETE_IDS\.includes\(c\._id\)/);
  assert.match(source, /DELETE_SLUGS\.includes\(c\.slug\)/);
});

test('flat state-folder uploads use the state as the collection key', () => {
  const source = read('scripts/upload-photos.mjs');

  assert.match(source, /uploadCity\(stateName, stateName, statePath\)/);
  assert.doesNotMatch(source, /uploadCity\(stateName,\s*['"]\.['"]\)/);
});
