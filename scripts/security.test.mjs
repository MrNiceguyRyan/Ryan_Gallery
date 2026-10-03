import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const sanityWriteScripts = [
  'scripts/upload-photos.mjs',
  'scripts/cleanup-collections.mjs',
  'scripts/backfill-region.mjs',
];

for (const relativePath of sanityWriteScripts) {
  const source = readFileSync(join(root, relativePath), 'utf8');

  assert.doesNotMatch(
    source,
    /\bsk[0-9A-Za-z]{48,}\b/,
    `${relativePath} must not contain a hardcoded Sanity API token`,
  );

  assert.doesNotMatch(
    source,
    /process\.env\.SANITY_TOKEN\s*\|\|/,
    `${relativePath} must not fall back to a baked-in SANITY_TOKEN value`,
  );

  assert.match(
    source,
    /const\s+SANITY_TOKEN\s*=\s*requireSanityToken\(\);/,
    `${relativePath} must require SANITY_TOKEN from the environment`,
  );
}

assert.match(
  readFileSync(join(root, '.env.example'), 'utf8'),
  /SANITY_TOKEN=/,
  '.env.example must document the Sanity token required by write scripts',
);

console.log('security checks passed');
