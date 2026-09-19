import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const filesWithSanityWrites = [
  'scripts/upload-photos.mjs',
  'scripts/backfill-region.mjs',
  'scripts/cleanup-collections.mjs',
];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Sanity mutation scripts never include checked-in write token fallbacks', async () => {
  for (const file of filesWithSanityWrites) {
    const source = await read(file);

    assert.equal(
      /\bsk[A-Za-z0-9_-]{20,}\b/.test(source),
      false,
      `${file} must not contain a Sanity API token literal`,
    );
    assert.equal(
      /process\.env\.SANITY_TOKEN\s*\|\|/.test(source),
      false,
      `${file} must not fall back from SANITY_TOKEN to a checked-in value`,
    );
    assert.match(
      source,
      /Fatal: SANITY_TOKEN is required/,
      `${file} must fail closed when SANITY_TOKEN is missing`,
    );
  }
});

test('direct state-folder uploads use the state name for collection metadata', async () => {
  const source = await read('scripts/upload-photos.mjs');

  assert.match(source, /const collectionName = cityFolderName === '\.' \? stateName : cityFolderName;/);
  assert.match(source, /const locationKey = collectionName\.toLowerCase\(\)\.trim\(\);/);
  assert.match(source, /findOrCreateCollection\(collectionName, stateName\)/);
  assert.match(source, /generateTitle\(collectionName, stateName,/);
});

test('empty collection cleanup requires an explicit ID allowlist before deleting', async () => {
  const source = await read('scripts/cleanup-collections.mjs');

  assert.match(source, /DELETE_EMPTY && DELETE_IDS\.size === 0/);
  assert.match(source, /--delete-empty requires an explicit --ids=<collectionId,\.\.\.> allowlist/);
  assert.match(source, /empties\.filter\(\(empty\) => DELETE_IDS\.has\(empty\._id\)\)/);
  assert.equal(
    /for \(const c of empties\) \{\s*await sanity\.delete\(c\._id\)/s.test(source),
    false,
    'cleanup must not bulk-delete every empty collection',
  );
});
