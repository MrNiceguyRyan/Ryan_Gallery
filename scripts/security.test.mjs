import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = {
  upload: readFileSync(new URL('./upload-photos.mjs', import.meta.url), 'utf8'),
  backfill: readFileSync(new URL('./backfill-region.mjs', import.meta.url), 'utf8'),
  cleanup: readFileSync(new URL('./cleanup-collections.mjs', import.meta.url), 'utf8'),
  layout: readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8'),
};

for (const [name, source] of Object.entries(files)) {
  assert(!/sk[A-Za-z0-9_-]{40,}/.test(source), `${name} contains a hardcoded Sanity token`);
  assert(!/process\.env\.SANITY_TOKEN\s*\|\|/.test(source), `${name} falls back from SANITY_TOKEN`);
}

assert(
  files.layout.includes('serializeJsonLd(schema)'),
  'Layout must escape JSON-LD before set:html injection',
);
assert(
  !/set:html=\{JSON\.stringify\(/.test(files.layout),
  'Layout must not inject raw JSON.stringify output into script tags',
);

assert(
  files.upload.includes("await uploadCity(stateName, '.', stateName)"),
  'Flat state-folder uploads must use the state name as the collection identity',
);

assert(
  files.cleanup.includes('--ids=') && files.cleanup.includes('DELETE_IDS.size === 0'),
  'Deleting empty collections must require explicit collection ids',
);
