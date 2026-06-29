/**
 * One-time data hygiene for collections.
 *
 *   node scripts/cleanup-collections.mjs              (DRY RUN — reports only)
 *   node scripts/cleanup-collections.mjs --apply      (trim whitespace names)
 *   node scripts/cleanup-collections.mjs --apply --delete-empty Orlando Arizona
 *                                                     (also delete named
 *                                                      photo-less collections)
 *
 * Requires: SANITY_TOKEN env var with write access.
 *
 * Fixes surfaced by the audit:
 *   - "New York " → "New York"  (trailing-space name)
 *   - empty duplicate "Orlando" + empty "Arizona"  (0 photos → noise in the
 *     homepage region clustering)
 *
 * Deleting is destructive and gated behind BOTH --apply and --delete-empty,
 * and only ever touches collections with exactly 0 referencing photos.
 */
import { createClient } from '@sanity/client';

const SANITY_TOKEN = process.env.SANITY_TOKEN;

const APPLY = process.argv.includes('--apply');
const DELETE_EMPTY = process.argv.includes('--delete-empty');
const DELETE_EMPTY_NAMES = DELETE_EMPTY
  ? process.argv
    .slice(process.argv.indexOf('--delete-empty') + 1)
    .filter((arg) => !arg.startsWith('--'))
  : [];
const DELETE_EMPTY_TARGETS = new Set(DELETE_EMPTY_NAMES.map(normalizeTarget));

if (!SANITY_TOKEN) {
  console.error('Missing SANITY_TOKEN. Set a Sanity write token in the environment before running this cleanup script.');
  process.exit(1);
}

if (DELETE_EMPTY && DELETE_EMPTY_TARGETS.size === 0) {
  console.error('Refusing to delete all empty collections. Pass exact collection names or ids after --delete-empty.');
  process.exit(1);
}

const sanity = createClient({
  projectId: 'z610fooo',
  dataset: 'production',
  apiVersion: '2024-03-16',
  token: SANITY_TOKEN,
  useCdn: false,
});

function normalizeTarget(value) {
  return String(value || '').trim().toLowerCase();
}

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
    console.log('   Re-run with --apply to trim names; add --delete-empty to remove the empties.\n');
    return;
  }

  for (const { c, trimmed } of trims) {
    await sanity.patch(c._id).set({ name: trimmed }).commit();
    console.log(`   ✓ trimmed "${c.name}" → "${trimmed}"`);
  }

  if (DELETE_EMPTY) {
    for (const c of empties) {
      if (!DELETE_EMPTY_TARGETS.has(normalizeTarget(c.name)) && !DELETE_EMPTY_TARGETS.has(normalizeTarget(c._id))) {
        console.log(`   (kept empty collection "${c.name}" — not listed after --delete-empty)`);
        continue;
      }
      await sanity.delete(c._id);
      console.log(`   ✓ deleted empty collection "${c.name}" (${c._id})`);
    }
  } else if (empties.length) {
    console.log('   (empties left in place — add --delete-empty to remove them)');
  }
  console.log('\n   ✅ Done.\n');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
