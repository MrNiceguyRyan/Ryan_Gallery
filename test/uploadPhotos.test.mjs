import test from 'node:test';
import assert from 'node:assert/strict';

import { collectionNameForFolder, slugify } from '../scripts/upload-photos.mjs';

test('flat state folders use the state name for collection metadata', () => {
  assert.equal(collectionNameForFolder('Macau', '.'), 'Macau');
  assert.equal(slugify(collectionNameForFolder('Macau', '.')), 'macau');
});

test('city subfolders keep their city collection metadata', () => {
  assert.equal(collectionNameForFolder('Florida', 'Miami'), 'Miami');
  assert.equal(slugify(collectionNameForFolder('Florida', 'Miami')), 'miami');
});
