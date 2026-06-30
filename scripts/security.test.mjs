import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const mutationScripts = [
  'scripts/upload-photos.mjs',
  'scripts/backfill-region.mjs',
  'scripts/cleanup-collections.mjs',
];

test('CMS mutation scripts do not include hardcoded Sanity write tokens', () => {
  for (const script of mutationScripts) {
    const source = readFileSync(script, 'utf8');

    assert.doesNotMatch(source, /sk[A-Za-z0-9]{40,}/, `${script} contains a Sanity secret token`);
    assert.doesNotMatch(
      source,
      /process\.env\.SANITY_TOKEN\s*\|\|/,
      `${script} falls back when SANITY_TOKEN is missing`,
    );
    assert.match(source, /const SANITY_TOKEN = process\.env\.SANITY_TOKEN;/);
    assert.match(source, /SANITY_TOKEN environment variable is required/);
  }
});

test('state-level photo uploads use the state name for collection identity', () => {
  const source = readFileSync('scripts/upload-photos.mjs', 'utf8');

  assert.match(source, /async function uploadCity\(stateName, cityFolderName, collectionFolderName = cityFolderName\)/);
  assert.match(source, /await uploadCity\(stateName, '\.', stateName\);/);
  assert.doesNotMatch(source, /await uploadCity\(stateName, '\.'\);/);
});
