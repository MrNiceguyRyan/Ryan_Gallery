import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const ROOT = new URL('..', import.meta.url);
const SCRIPT_FILES = [
  'scripts/upload-photos.mjs',
  'scripts/backfill-region.mjs',
  'scripts/cleanup-collections.mjs',
];

test('Sanity maintenance scripts do not contain committed write tokens', async () => {
  for (const relativePath of SCRIPT_FILES) {
    const source = await readFile(new URL(relativePath, ROOT), 'utf8');
    assert.doesNotMatch(
      source,
      /['"`]sk[A-Za-z0-9]{40,}['"`]/,
      `${relativePath} must read SANITY_TOKEN from the environment, not a literal token`,
    );
  }
});

test('direct state-folder uploads use the state name as the collection name', async () => {
  const source = await readFile(new URL('scripts/upload-photos.mjs', ROOT), 'utf8');

  assert.match(
    source,
    /await uploadCity\(stateName, stateName, statePath\);/,
    'Direct photos in a state folder must not upload into a "." collection with an empty slug',
  );
});

test('collection cleanup deletes only explicitly reviewed empty collection ids', async () => {
  const source = await readFile(new URL('scripts/cleanup-collections.mjs', ROOT), 'utf8');

  assert.match(
    source,
    /--delete-id=<collectionId>/,
    'Cleanup usage should require explicit collection ids for destructive deletes',
  );
  assert.doesNotMatch(
    source,
    /for \(const c of empties\)[\s\S]*sanity\.delete\(c\._id\)/,
    'Cleanup must not blanket-delete every empty collection',
  );
});
