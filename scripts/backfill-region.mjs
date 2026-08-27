/**
 * One-time backfill: set `region` on existing collections that don't have one.
 *
 * Usage:
 *   node scripts/backfill-region.mjs --dry-run   (show what would change)
 *   node scripts/backfill-region.mjs             (apply with setIfMissing)
 *
 * Safe to re-run: uses setIfMissing, so a manually-set region is never
 * overwritten, and already-tagged collections are skipped.
 *
 * Requires: SANITY_TOKEN env var.
 */

import { createClient } from '@sanity/client';

const SANITY_TOKEN = process.env.SANITY_TOKEN;

if (!SANITY_TOKEN) {
  console.error('Fatal: SANITY_TOKEN environment variable is required for Sanity access.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const sanity = createClient({
  projectId: 'z610fooo',
  dataset: 'production',
  apiVersion: '2024-03-16',
  token: SANITY_TOKEN,
  useCdn: false,
});

// City slug → Region. Mirrors the Desktop/PHOTO folder structure
// (Region → City). Keys are collection slugs (and a few name variants).
const SLUG_REGION = {
  // Florida
  miami: 'Florida',
  orlando: 'Florida',
  // New York (single-place region)
  'new-york': 'New York',
  'new-york-stories': 'New York',
  // Utah
  zion: 'Utah',
  'zion-national-park': 'Utah',
  'bryce-canyon': 'Utah',
  'bryce-canyon-national-park': 'Utah',
  'capitol-reef': 'Utah',
  'capitol-reef-national-park': 'Utah',
  // Arizona
  arizona: 'Arizona',
  page: 'Arizona',
  'grand-canyon': 'Arizona',
  'grand-canyon-national-park': 'Arizona',
  '66-road': 'Arizona',
  // California
  'death-valley': 'California',
  'death-valley-national-park': 'California',
  'los-angeles': 'California',
  'san-diego': 'California',
  // Colorado
  denver: 'Colorado',
  'rocky-mountain': 'Colorado',
  'rocky-mountain-national-park': 'Colorado',
  // DMV
  baltimore: 'DMV',
  dc: 'DMV',
  'washington-dc': 'DMV',
  // Nevada
  'las-vegas': 'Nevada',
  // Washington (state)
  seattle: 'Washington',
  // Single-region locations
  macau: 'Macau',
  philadelphia: 'Philadelphia',
};

// Fallback: lowercased collection NAME → Region (in case slug differs).
const NAME_REGION = {
  miami: 'Florida',
  orlando: 'Florida',
  'new york': 'New York',
  zion: 'Utah',
  'bryce canyon': 'Utah',
  'capitol reef': 'Utah',
  page: 'Arizona',
  arizona: 'Arizona',
  'grand canyon': 'Arizona',
  '66 road': 'Arizona',
  'death valley': 'California',
  'los angeles': 'California',
  'san diego': 'California',
  denver: 'Colorado',
  'rocky mountain': 'Colorado',
  baltimore: 'DMV',
  'washington dc': 'DMV',
  'las vegas': 'Nevada',
  seattle: 'Washington',
  macau: 'Macau',
  philadelphia: 'Philadelphia',
};

function resolveRegion(col) {
  const slug = (col.slug || '').toLowerCase();
  const name = (col.name || '').toLowerCase().trim();
  return SLUG_REGION[slug] || NAME_REGION[name] || null;
}

async function main() {
  console.log(`\n🗺  Backfill collection.region  ${DRY_RUN ? '(DRY RUN — no writes)' : '(LIVE)'}\n`);

  const collections = await sanity.fetch(
    `*[_type == "collection"] | order(name asc){ _id, name, "slug": slug.current, region }`
  );
  console.log(`   Found ${collections.length} collections\n`);

  let toSet = 0;
  let skipped = 0;
  let unmapped = 0;

  for (const col of collections) {
    if (col.region) {
      console.log(`   ⏭  "${col.name}" already region="${col.region}"`);
      skipped++;
      continue;
    }
    const region = resolveRegion(col);
    if (!region) {
      console.log(`   ❓ "${col.name}" (slug: ${col.slug}) → NO MAPPING — set manually in Studio`);
      unmapped++;
      continue;
    }
    console.log(`   ${DRY_RUN ? '•' : '✓'}  "${col.name}" → region="${region}"`);
    toSet++;
    if (!DRY_RUN) {
      await sanity.patch(col._id).setIfMissing({ region }).commit();
    }
  }

  console.log(
    `\n   Summary: ${toSet} ${DRY_RUN ? 'would be set' : 'set'} · ${skipped} already tagged · ${unmapped} unmapped`
  );
  if (DRY_RUN) console.log('   Re-run without --dry-run to apply.\n');
  else console.log('   ✅ Done.\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
