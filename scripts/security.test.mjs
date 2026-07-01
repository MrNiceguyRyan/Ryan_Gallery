import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const SANITY_SCRIPT_PATHS = [
  'scripts/upload-photos.mjs',
  'scripts/backfill-region.mjs',
  'scripts/cleanup-collections.mjs',
];

for (const scriptPath of SANITY_SCRIPT_PATHS) {
  const source = readFileSync(scriptPath, 'utf8');

  assert.match(
    source,
    /const SANITY_TOKEN = process\.env\.SANITY_TOKEN;/,
    `${scriptPath} must read SANITY_TOKEN from the environment`,
  );

  assert.doesNotMatch(
    source,
    /SANITY_TOKEN\s*=\s*process\.env\.SANITY_TOKEN\s*\|\|/,
    `${scriptPath} must not fall back to a checked-in token`,
  );

  assert.doesNotMatch(
    source,
    /sk[A-Za-z0-9]{40,}/,
    `${scriptPath} must not contain a Sanity API token literal`,
  );
}

