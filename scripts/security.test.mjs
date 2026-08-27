import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const SOURCE_DIRS = ['scripts', 'src'];
const SOURCE_EXTS = new Set(['.astro', '.js', '.mjs', '.ts', '.tsx']);
const SANITY_TOKEN_RE = /sk[A-Za-z0-9]{40,}/;

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...walk(path));
      continue;
    }

    const ext = path.slice(path.lastIndexOf('.'));
    if (SOURCE_EXTS.has(ext)) files.push(path);
  }

  return files;
}

test('source files do not contain hardcoded Sanity API tokens', () => {
  const offenders = SOURCE_DIRS
    .flatMap((dir) => walk(dir))
    .filter((file) => SANITY_TOKEN_RE.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});
