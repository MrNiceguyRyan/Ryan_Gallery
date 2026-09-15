/**
 * Static guards for content-pipeline safety regressions that have
 * repeatedly reappeared on main.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const upload = read('scripts/upload-photos.mjs');
const backfill = read('scripts/backfill-region.mjs');
const cleanup = read('scripts/cleanup-collections.mjs');
const layout = read('src/layouts/Layout.astro');
const jsonLd = read('src/lib/jsonLd.js');

// 1) No committed Sanity write-token literals or env fallbacks.
for (const [name, src] of [
  ['upload-photos.mjs', upload],
  ['backfill-region.mjs', backfill],
  ['cleanup-collections.mjs', cleanup],
]) {
  assert.match(
    src,
    /process\.env\.SANITY_TOKEN/,
    `${name} must read SANITY_TOKEN from the environment`,
  );
  assert.doesNotMatch(
    src,
    /sk[A-Za-z0-9]{20,}/,
    `${name} must not embed a Sanity token literal`,
  );
  assert.doesNotMatch(
    src,
    /process\.env\.SANITY_TOKEN\s*\|\|/,
    `${name} must not fall back to a hardcoded token`,
  );
}

// 2) Flat state-folder uploads must use the state name for CMS metadata.
assert.match(
  upload,
  /uploadCity\(\s*stateName\s*,\s*['"]\.['"]\s*,\s*stateName\s*\)/,
  'uploadState must call uploadCity(stateName, ".", stateName) for flat folders',
);
assert.match(
  upload,
  /collectionLabel/,
  'uploadCity must accept a collectionLabel distinct from the filesystem path',
);

// 3) Empty-collection deletes require an explicit --ids allowlist.
assert.match(
  cleanup,
  /--ids=/,
  'cleanup must document/require --ids= for empty deletes',
);
assert.match(
  cleanup,
  /Refusing to delete empty collections without an explicit --ids/,
  'cleanup must refuse blanket empty deletes',
);

// 4) JSON-LD must be escaped before Astro set:html.
assert.match(jsonLd, /serializeJsonLd/, 'src/lib/jsonLd.js must export serializeJsonLd');
assert.match(
  layout,
  /serializeJsonLd/,
  'Layout.astro must use serializeJsonLd for JSON-LD embedding',
);
assert.doesNotMatch(
  layout,
  /set:html=\{JSON\.stringify/,
  'Layout.astro must not embed raw JSON.stringify into set:html',
);

// 5) CMS Instagram hrefs must be protocol-allowlisted (blocks javascript:).
const about = read('src/components/about/AboutPage.tsx');
assert.match(about, /function safeHttpUrl/, 'AboutPage must define safeHttpUrl');
assert.match(
  about,
  /parsed\.protocol === 'http:' \|\| parsed\.protocol === 'https:'/,
  'AboutPage must allow only http(s) Instagram URLs',
);

// 6) Portable Text must not map missing children.
const narratives = read('src/lib/narratives.tsx');
assert.match(
  narratives,
  /block\.children \?\? \[\]/,
  'renderPortableText must guard missing block.children',
);

console.log('security.test.mjs: ok');
