import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const mutationScripts = [
  'scripts/upload-photos.mjs',
  'scripts/backfill-region.mjs',
  'scripts/cleanup-collections.mjs',
];

for (const relativePath of mutationScripts) {
  const source = readFileSync(join(repoRoot, relativePath), 'utf8');

  assert.doesNotMatch(
    source,
    /sk[A-Za-z0-9]{20,}/,
    `${relativePath} must not contain a checked-in Sanity token`,
  );
  assert.doesNotMatch(
    source,
    /process\.env\.SANITY_TOKEN\s*\|\|/,
    `${relativePath} must not fall back to a checked-in SANITY_TOKEN`,
  );
  assert.match(
    source,
    /const SANITY_TOKEN = process\.env\.SANITY_TOKEN;/,
    `${relativePath} must read SANITY_TOKEN from the environment`,
  );
  assert.match(
    source,
    /if \(!SANITY_TOKEN\) \{/,
    `${relativePath} must fail closed when SANITY_TOKEN is missing`,
  );
}

const uploadSource = readFileSync(join(repoRoot, 'scripts/upload-photos.mjs'), 'utf8');

assert.match(
  uploadSource,
  /const collectionName = cityFolderName === '\.' \? stateName : cityFolderName;/,
  'flat state-folder uploads must use the state name as the collection name',
);
assert.match(
  uploadSource,
  /findOrCreateCollection\(collectionName, stateName\)/,
  'flat state-folder uploads must not create a "." collection',
);
