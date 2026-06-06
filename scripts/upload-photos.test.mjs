import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectionNameForCityFolder,
  collectionSlugForCityFolder,
  resolveSanityToken,
  slugify,
} from './upload-photos.mjs';

describe('upload photo helpers', () => {
  it('loads the Sanity write token only from the environment', () => {
    assert.equal(resolveSanityToken({ SANITY_TOKEN: ' sk-test-token ' }), 'sk-test-token');
    assert.throws(
      () => resolveSanityToken({}),
      /SANITY_TOKEN environment variable is required/
    );
  });

  it('slugifies collection names', () => {
    assert.equal(slugify('Grand Canyon National Park'), 'grand-canyon-national-park');
    assert.equal(slugify('Macau'), 'macau');
  });

  it('uses the state name for photos directly under a state folder', () => {
    assert.equal(collectionNameForCityFolder('.', 'Macau'), 'Macau');
    assert.equal(collectionSlugForCityFolder('.', 'Macau'), 'macau');
  });

  it('rejects collection names that cannot produce a slug', () => {
    assert.throws(
      () => collectionSlugForCityFolder('!!!', 'Florida'),
      /Cannot derive a non-empty collection slug/
    );
  });
});
