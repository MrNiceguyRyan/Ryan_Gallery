import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const checkedFiles = [
  'scripts/upload-photos.mjs',
  'scripts/backfill-region.mjs',
  'scripts/cleanup-collections.mjs',
];

test('Sanity maintenance scripts do not commit write tokens', () => {
  for (const file of checkedFiles) {
    const source = readFileSync(file, 'utf8');

    assert.doesNotMatch(
      source,
      /sk[A-Za-z0-9]{40,}/,
      `${file} must not contain a hardcoded Sanity token`,
    );
    assert.doesNotMatch(
      source,
      /process\.env\.SANITY_TOKEN\s*\|\|/,
      `${file} must not fall back to a committed SANITY_TOKEN value`,
    );
  }
});
