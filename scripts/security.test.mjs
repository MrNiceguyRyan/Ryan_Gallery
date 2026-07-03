import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = new URL('..', import.meta.url);

const sanityScripts = [
  'scripts/upload-photos.mjs',
  'scripts/cleanup-collections.mjs',
  'scripts/backfill-region.mjs',
];

for (const file of sanityScripts) {
  const source = readFileSync(new URL(file, repoRoot), 'utf8');

  assert.match(
    source,
    /const\s+SANITY_TOKEN\s*=\s*process\.env\.SANITY_TOKEN/,
    `${file} must read SANITY_TOKEN from the environment`,
  );
  assert.doesNotMatch(
    source,
    /process\.env\.SANITY_TOKEN\s*\|\|/,
    `${file} must not fall back to a checked-in token`,
  );
  assert.doesNotMatch(
    source,
    /sk[A-Za-z0-9]{60,}/,
    `${file} must not contain a Sanity API token literal`,
  );
}

const uploadSource = readFileSync(join(repoRoot.pathname, 'scripts/upload-photos.mjs'), 'utf8');

assert.match(
  uploadSource,
  /const\s+cityName\s*=\s*cityFolderName\s*===\s*'\.'\s*\?\s*stateName\s*:\s*cityFolderName/,
  'Direct state-folder uploads must use the state name as the collection identity',
);
assert.match(
  uploadSource,
  /findOrCreateCollection\(cityName,\s*stateName\)/,
  'Upload collections must be created from the normalized city name',
);
assert.match(
  uploadSource,
  /generateTitle\(cityName,\s*stateName,/,
  'Photo titles must be generated from the normalized city name',
);
