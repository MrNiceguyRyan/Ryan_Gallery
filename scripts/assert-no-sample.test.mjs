// Run offline: node --test scripts/assert-no-sample.test.mjs
//
// The production guard (scripts/assert-no-sample.mjs): a dist/ built with a
// preview-only sample is refused for production and allowed for the preview
// worker, and wrangler runs it before either deploy (wrangler.jsonc).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { samplesIn } from './assert-no-sample.mjs';

const script = fileURLToPath(new URL('./assert-no-sample.mjs', import.meta.url));
const run = (dir, ...args) => spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ASSERT_DIST_DIR: `${dir}/` }, encoding: 'utf8' });

test('the stamps and the placeholder text are found; a clean page is clean', () => {
  assert.equal(samplesIn('<!DOCTYPE html><html lang="en" class="x"><body>Miami</body></html>').size, 0);
  assert.equal(samplesIn('<html lang="en" data-story-sample><body></body></html>').size, 1);
  assert.equal(samplesIn('<html data-story-sample="" lang="en"><body></body></html>').size, 1);
  assert.equal(samplesIn('<html lang="en" data-notes-sample>').size, 1);
  assert.equal(samplesIn('<html lang="en"><body><h3>Sample chapter one</h3></body></html>').size, 1);
  // Only the <html> tag's own attributes count as a stamp.
  assert.equal(samplesIn('<html lang="en"><body><code>data-story-sample</code></body></html>').size, 0);
  assert.equal(samplesIn('<html lang="en" data-story-sampler>').size, 0);
});

test('production refuses a sample build; the preview worker takes it', () => {
  const root = mkdtempSync(join(tmpdir(), 'assert-no-sample-'));
  try {
    const clean = join(root, 'clean');
    mkdirSync(join(clean, 'works', 'miami'), { recursive: true });
    writeFileSync(join(clean, 'index.html'), '<html lang="en"><body>ok</body></html>');
    writeFileSync(join(clean, 'works', 'miami', 'index.html'), '<html lang="en"><body>ok</body></html>');
    assert.equal(run(clean).status, 0);
    assert.equal(run(clean, '--preview').status, 0);

    const sample = join(root, 'sample');
    mkdirSync(join(sample, 'works', 'miami'), { recursive: true });
    writeFileSync(join(sample, 'index.html'), '<html lang="en"><body>ok</body></html>');
    writeFileSync(join(sample, 'works', 'miami', 'index.html'), '<html lang="en" data-story-sample><body>ok</body></html>');
    const refused = run(sample);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /REFUSED/);
    assert.equal(run(sample, '--preview').status, 0);

    const notes = join(root, 'notes');
    mkdirSync(join(notes, 'notes', 'sample'), { recursive: true });
    writeFileSync(join(notes, 'index.html'), '<html lang="en"><body>ok</body></html>');
    assert.equal(run(notes).status, 1);

    assert.equal(run(join(root, 'missing')).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('wrangler runs the guard before a production and a preview deploy', () => {
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(config, /"build":\s*\{\s*"command":\s*"node scripts\/assert-no-sample\.mjs"\s*\}/);
  assert.match(config, /"build":\s*\{\s*"command":\s*"node scripts\/assert-no-sample\.mjs --preview"\s*\}/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.build, 'astro build');
  assert.match(pkg.scripts['build:sample'], /STORY_CHAPTERS_SAMPLE=1/);
});
