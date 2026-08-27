/**
 * One-time data hygiene for collections.
 *
 *   node scripts/cleanup-collections.mjs              (DRY RUN — reports only)
 *   node scripts/cleanup-collections.mjs --apply      (trim whitespace names)
 *   node scripts/cleanup-collections.mjs --apply --delete-empty --ids=<id,id>
 *                                                     (also delete the named
 *                                                      photo-less collections)
 *
 * Fixes surfaced by the audit:
 *   - "New York " → "New York"  (trailing-space name)
 *   - empty duplicate "Orlando" + empty "Arizona"  (0 photos → noise in the
 *     homepage region clustering)
 *
 * Deleting is destructive and gated behind --apply, --delete-empty, and an
 * explicit --ids allowlist. It only touches those IDs when they still have
 * exactly 0 referencing photos.
 */
import { createClient } from '@sanity/client';

const SANITY_TOKEN = process.env.SANITY_TOKEN;

const APPLY = process.argv.includes('--apply');
const DELETE_EMPTY = process.argv.includes('--delete-empty');
const DELETE_IDS = new Set(
  (process.argv.find((arg) => arg.startsWith('--ids='))?.slice('--ids='.length) || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

if (!SANITY_TOKEN) {
  console.error('Fatal: SANITY_TOKEN is required for Sanity writes.');
  process.exit(1);
}

if (DELETE_EMPTY && DELETE_IDS.size === 0) {
  console.error('Fatal: --delete-empty requires an explicit --ids=<collectionId,...> allowlist.');
  process.exit(1);
}

const sanity = createClient({
  projectId: 'z610fooo',
  dataset: 'production',
  apiVersion: '2024-03-16',
  token: SANITY_TOKEN,
  useCdn: false,
});

async function main() {
  console.log(`\n🧹 Collection cleanup  ${APPLY ? '(APPLY)' : '(DRY RUN — no writes)'}${DELETE_EMPTY ? ' +delete-empty' : ''}\n`);

  const cols = await sanity.fetch(
    `*[_type == "collection"]{ _id, name, region, "n": count(*[_type=="photo" && references(^._id)]) } | order(name asc)`,
  );

  const trims = [];
  const empties = [];
  for (const c of cols) {
    const trimmed = (c.name || '').trim();
    const flags = [];
    if (trimmed !== c.name) { flags.push(`trim → "${trimmed}"`); trims.push({ c, trimmed }); }
    if (c.n === 0) { flags.push('EMPTY (0 photos)'); empties.push(c); }
    console.log(`   ${String(c.n).padStart(3)} photos · ${(c.region || '—').padEnd(12)} · "${c.name}"${flags.length ? '   ⟶ ' + flags.join(', ') : ''}`);
  }

  console.log(`\n   ${trims.length} name(s) to trim · ${empties.length} empty collection(s)\n`);

  if (!APPLY) {
    console.log('   Re-run with --apply to trim names; add --delete-empty --ids=<collectionId,...> to remove specific empties.\n');
    return;
  }

  for (const { c, trimmed } of trims) {
    await sanity.patch(c._id).set({ name: trimmed }).commit();
    console.log(`   ✓ trimmed "${c.name}" → "${trimmed}"`);
  }

  if (DELETE_EMPTY) {
    const requested = new Set(DELETE_IDS);
    for (const c of empties.filter((empty) => DELETE_IDS.has(empty._id))) {
      await sanity.delete(c._id);
      requested.delete(c._id);
      console.log(`   ✓ deleted empty collection "${c.name}" (${c._id})`);
    }
    for (const id of requested) {
      console.log(`   ! skipped ${id} — not found or no longer empty`);
    }
  } else if (empties.length) {
    console.log('   (empties left in place — add --delete-empty --ids=<collectionId,...> to remove specific empties)');
  }
  console.log('\n   ✅ Done.\n');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
