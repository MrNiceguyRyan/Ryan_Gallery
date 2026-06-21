import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { getRequiredSanityToken } from '../scripts/sanity-token.mjs';

const originalToken = process.env.SANITY_TOKEN;
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.SANITY_TOKEN;
  } else {
    process.env.SANITY_TOKEN = originalToken;
  }
});

test('requires SANITY_TOKEN to be set', () => {
  delete process.env.SANITY_TOKEN;

  assert.throws(
    () => getRequiredSanityToken(),
    /SANITY_TOKEN environment variable is required/,
  );
});

test('returns a trimmed SANITY_TOKEN value', () => {
  process.env.SANITY_TOKEN = '  test-token  ';

  assert.equal(getRequiredSanityToken(), 'test-token');
});

test('maintenance scripts do not contain committed Sanity API tokens', async () => {
  const scriptNames = [
    'backfill-region.mjs',
    'cleanup-collections.mjs',
    'upload-photos.mjs',
  ];

  for (const scriptName of scriptNames) {
    const contents = await readFile(join(repoRoot, 'scripts', scriptName), 'utf8');

    assert.doesNotMatch(contents, /sk[A-Za-z0-9_-]{20,}/, scriptName);
  }
});
