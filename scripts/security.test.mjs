import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

const mutationScripts = [
  'scripts/upload-photos.mjs',
  'scripts/backfill-region.mjs',
  'scripts/cleanup-collections.mjs',
];

for (const file of mutationScripts) {
  const source = read(file);

  assert(
    !/sk[A-Za-z0-9_-]{20,}/.test(source),
    `${file} must not contain a checked-in Sanity token`,
  );
  assert(
    !/process\.env\.SANITY_TOKEN\s*(?:\|\||\?\?)/.test(source),
    `${file} must not fall back when SANITY_TOKEN is missing`,
  );
  assert(
    source.includes('if (!SANITY_TOKEN)'),
    `${file} must fail fast when SANITY_TOKEN is missing`,
  );
}

const layout = read('src/layouts/Layout.astro');
assert(layout.includes('serializeJsonLd(schema)'));
assert(!layout.includes('set:html={JSON.stringify(schema)}'));

const uploadPhotos = read('scripts/upload-photos.mjs');
assert(uploadPhotos.includes("uploadCity(stateName, '.', stateName)"));

const cleanupCollections = read('scripts/cleanup-collections.mjs');
assert(!cleanupCollections.includes("process.argv.includes('--delete-empty')"));
assert(cleanupCollections.includes('DELETE_EMPTY_IDS'));
assert(cleanupCollections.includes('Refusing broad deletion'));
