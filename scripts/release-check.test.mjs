import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicationAssets, inspectRelease } from './release-check.mjs';

test('collects lazy Astro island assets and removes duplicate/query variants', () => {
  assert.deepEqual(applicationAssets('<script src="/_astro/a.js"></script><link href="/_astro/a.js?v=1"><astro-island component-url="/_astro/b.js" renderer-url="/_astro/c.js">'), ['/_astro/a.js', '/_astro/b.js', '/_astro/c.js']);
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'gallery-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['travel', 'about', 'works/new-city', '_astro']) await mkdir(join(root, path), { recursive: true });
  for (const path of ['index.html', 'travel/index.html', 'about/index.html', 'works/new-city/index.html']) {
    await writeFile(join(root, path), '<title>Ryan | Archive</title><script src="/_astro/app.js"></script>');
  }
  await writeFile(join(root, '_astro/app.js'), 'export {};');
  return root;
}

test('discovers new city routes without a hard-coded city count', async (t) => {
  const result = await inspectRelease(await fixture(t));
  assert.equal(result.stories, 1);
  assert.ok(result.pages.includes('/works/new-city/'));
});

test('fails the release when a lazy application asset is missing', async (t) => {
  const root = await fixture(t);
  await rm(join(root, '_astro/app.js'));
  await assert.rejects(inspectRelease(root), /ENOENT/);
});

test('fails the release when a required main page is missing', async (t) => {
  const root = await fixture(t);
  await rm(join(root, 'travel/index.html'));
  await assert.rejects(inspectRelease(root), /Required page missing/);
});
