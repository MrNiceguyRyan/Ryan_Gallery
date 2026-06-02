import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildCityUploadTarget } from '../scripts/upload-photos.mjs';

test('upload script reads the Sanity token from the environment', async () => {
  const source = await readFile(new URL('../scripts/upload-photos.mjs', import.meta.url), 'utf8');

  assert.match(source, /const SANITY_TOKEN = process\.env\.SANITY_TOKEN;/);
  assert.doesNotMatch(source, /SANITY_TOKEN\s*=\s*['"`]/);
});

test('flat state photo folders keep the state name as collection metadata', () => {
  assert.deepEqual(buildCityUploadTarget('Macau', '.'), {
    cityName: 'Macau',
    cityPath: '/Users/ryan/Desktop/PHOTO/Macau',
  });
});

test('nested city folders still resolve under their state folder', () => {
  assert.deepEqual(buildCityUploadTarget('Florida', 'Miami'), {
    cityName: 'Miami',
    cityPath: '/Users/ryan/Desktop/PHOTO/Florida/Miami',
  });
});
