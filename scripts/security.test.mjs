import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  '.astro',
  '.git',
  'dist',
  'node_modules',
]);
const SCANNED_EXTS = new Set([
  '.astro',
  '.js',
  '.json',
  '.mjs',
  '.ts',
  '.tsx',
]);

const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(path);
      continue;
    }

    const ext = entry.includes('.') ? entry.slice(entry.lastIndexOf('.')) : '';
    if (!SCANNED_EXTS.has(ext)) continue;

    const text = readFileSync(path, 'utf8');
    const displayPath = relative(ROOT, path);

    if (/['"`]sk[A-Za-z0-9]{40,}['"`]/.test(text)) {
      violations.push(`${displayPath}: contains a likely Sanity API token`);
    }

    if (/process\.env\.SANITY_TOKEN\s*(?:\|\||\?\?)/.test(text)) {
      violations.push(`${displayPath}: SANITY_TOKEN must not have a fallback`);
    }
  }
}

walk(ROOT);

assert.equal(
  violations.length,
  0,
  `Security check failed:\n${violations.map((v) => `- ${v}`).join('\n')}`,
);

console.log('Security checks passed.');
