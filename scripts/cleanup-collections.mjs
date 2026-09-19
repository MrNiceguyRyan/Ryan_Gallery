/**
 * One-time data hygiene for collections.
 *
 *   node scripts/cleanup-collections.mjs              (DRY RUN — reports only)
 *   node scripts/cleanup-collections.mjs --apply      (trim whitespace names)
 *   node scripts/cleanup-collections.mjs --apply --delete-empty --ids=<id,id>
 *                                                     (delete reviewed photo-less
 *                                                      collections by ID)
 *
 * Fixes surfaced by the audit:
 *   - "New York " → "New York"  (trailing-space name)
 *   - empty duplicate "Orlando" + empty "Arizona"  (0 photos → noise in the
 *     homepage region clustering)
 *
 * Deleting is destructive and gated behind --apply, --delete-empty, and an
 * explicit comma-separated --ids allow-list. It only ever touches allow-listed
 * collections with exactly 0 referencing photos.
 */
import { createClient } from '@sanity/client';

const SANITY_TOKEN = requireEnv('SANITY_TOKEN');

const APPLY = process.argv.includes('--apply');
const DELETE_EMPTY = process.argv.includes('--delete-empty');
const DELETE_IDS = parseIdsArg(process.argv.find((arg) => arg.startsWith('--ids=')));

const sanity = createClient({
  projectId: 'z610fooo',
  dataset: 'production',
  apiVersion: '2024-03-16',
  token: SANITY_TOKEN,
  useCdn: false,
});

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Set it in your environment before running this Sanity mutation script.`);
  }
  return value;
}

function parseIdsArg(arg) {
  if (!arg) return new Set();
  return new Set(arg.slice('--ids='.length).split(',').map((id) => id.trim()).filter(Boolean));
}

async function main() {
  if (APPLY && DELETE_EMPTY && DELETE_IDS.size === 0) {
    throw new Error('Refusing to delete empty collections without explicit --ids=<collectionId,...>. Run a dry run first, review IDs, then allow-list the exact documents to delete.');
  }

  console.log(`\n🧹 Collection cleanup  ${APPLY ? '(APPLY)' : '(DRY RUN — no writes)'}${DELETE_EMPTY ? ` +delete-empty (${DELETE_IDS.size} id allow-list)` : ''}\n`);

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
    console.log('   Re-run with --apply to trim names; add --delete-empty --ids=<collectionId,...> to remove reviewed empties.\n');
    return;
  }

  for (const { c, trimmed } of trims) {
    await sanity.patch(c._id).set({ name: trimmed }).commit();
    console.log(`   ✓ trimmed "${c.name}" → "${trimmed}"`);
  }

  if (DELETE_EMPTY) {
    const emptyIds = new Set(empties.map((c) => c._id));
    const skippedIds = [...DELETE_IDS].filter((id) => !emptyIds.has(id));
    for (const c of empties.filter((empty) => DELETE_IDS.has(empty._id))) {
      await sanity.delete(c._id);
      console.log(`   ✓ deleted empty collection "${c.name}" (${c._id})`);
    }
    if (skippedIds.length) {
      console.log(`   ! skipped non-empty or missing id(s): ${skippedIds.join(', ')}`);
    }
  } else if (empties.length) {
    console.log('   (empties left in place — add --delete-empty to remove them)');
  }
  console.log('\n   ✅ Done.\n');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
