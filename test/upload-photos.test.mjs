import assert from 'node:assert/strict';
import test from 'node:test';

import { getCityUploadContext } from '../scripts/upload-photos.mjs';

test('direct state-folder uploads use the state name as collection metadata', () => {
  const context = getCityUploadContext('Macau', '.');

  assert.equal(context.cityPath.endsWith('/PHOTO/Macau'), true);
  assert.equal(context.collectionFolderName, 'Macau');
  assert.equal(context.locationKey, 'macau');
});

test('city subfolder uploads keep city-specific metadata and path', () => {
  const context = getCityUploadContext('Florida', 'Miami');

  assert.equal(context.cityPath.endsWith('/PHOTO/Florida/Miami'), true);
  assert.equal(context.collectionFolderName, 'Miami');
  assert.equal(context.locationKey, 'miami');
});
