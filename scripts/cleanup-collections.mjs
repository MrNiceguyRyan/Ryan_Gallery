/**
 * One-time data hygiene for collections.
 *
 *   node scripts/cleanup-collections.mjs              (DRY RUN — reports only)
 *   node scripts/cleanup-collections.mjs --apply      (trim whitespace names)
 *   node scripts/cleanup-collections.mjs --apply --delete-empty <collection-id>
 *                                                     (also delete the named
 *                                                      photo-less collection)
 *
 * Requires: SANITY_TOKEN env var.
 *
 * Fixes surfaced by the audit:
 *   - "New York " → "New York"  (trailing-space name)
 *   - empty duplicate "Orlando" + empty "Arizona"  (0 photos → noise in the
 *     homepage region clustering)
 *
 * Deleting is destructive and gated behind --apply plus explicit collection IDs,
 * and only ever touches named collections with exactly 0 referencing photos.
 */
import { createClient } from '@sanity/client';

const SANITY_TOKEN =
  process.env.SANITY_TOKEN;

const APPLY = process.argv.includes('--apply');
const { ids: deleteEmptyIds, hasBareFlag } = parseDeleteEmptyArgs(process.argv);
const DELETE_EMPTY_IDS = new Set(deleteEmptyIds);
const DELETE_EMPTY = DELETE_EMPTY_IDS.size > 0;

if (!SANITY_TOKEN) {
  console.error('Missing SANITY_TOKEN. Set it in the environment before running cleanup-collections.mjs.');
  process.exit(1);
}

if (hasBareFlag) {
  console.error('Refusing broad deletion. Pass explicit IDs, e.g. --delete-empty <collection-id>.');
  process.exit(1);
}

const sanity = createClient({
  projectId: 'z610fooo',
  dataset: 'production',
  apiVersion: '2024-03-16',
  token: SANITY_TOKEN,
  useCdn: false,
});

function parseDeleteEmptyArgs(argv) {
  const ids = [];
  let hasBareFlag = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--delete-empty') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        hasBareFlag = true;
        continue;
      }
      ids.push(next);
      i++;
    } else if (arg.startsWith('--delete-empty=')) {
      const value = arg.slice('--delete-empty='.length);
      if (!value.trim()) {
        hasBareFlag = true;
        continue;
      }
      ids.push(...value.split(',').map((id) => id.trim()).filter(Boolean));
    }
  }

  return { ids, hasBareFlag };
}

async function main() {
  console.log(`\n🧹 Collection cleanup  ${APPLY ? '(APPLY)' : '(DRY RUN — no writes)'}${DELETE_EMPTY ? ` +delete-empty:${[...DELETE_EMPTY_IDS].join(',')}` : ''}\n`);

  const cols = await sanity.fetch(
    `*[_type == "collection"]{ _id, name, region, "n": count(*[_type=="photo" && references(^._id)]) } | order(name asc)`,
  );

  const trims = [];
  const empties = [];
  for (const c of cols) {
    const trimmed = (c.name || '').trim();
    const flags = [];
    if (trimmed !== c.name) { flags.push(`trim → "${trimmed}"`); trims.push({ c, trimmed }); }
    if (c.n === 0) { flags.push(`EMPTY (0 photos, id: ${c._id})`); empties.push(c); }
    console.log(`   ${String(c.n).padStart(3)} photos · ${(c.region || '—').padEnd(12)} · "${c.name}"${flags.length ? '   ⟶ ' + flags.join(', ') : ''}`);
  }

  console.log(`\n   ${trims.length} name(s) to trim · ${empties.length} empty collection(s)\n`);

  if (!APPLY) {
    console.log('   Re-run with --apply to trim names; add --delete-empty <collection-id> to remove a listed empty.\n');
    return;
  }

  for (const { c, trimmed } of trims) {
    await sanity.patch(c._id).set({ name: trimmed }).commit();
    console.log(`   ✓ trimmed "${c.name}" → "${trimmed}"`);
  }

  if (DELETE_EMPTY) {
    const emptyById = new Map(empties.map((c) => [c._id, c]));
    const invalidIds = [...DELETE_EMPTY_IDS].filter((id) => !emptyById.has(id));
    if (invalidIds.length > 0) {
      throw new Error(`Refusing to delete unknown or non-empty collection IDs: ${invalidIds.join(', ')}`);
    }

    for (const c of [...DELETE_EMPTY_IDS].map((id) => emptyById.get(id))) {
      await sanity.delete(c._id);
      console.log(`   ✓ deleted empty collection "${c.name}" (${c._id})`);
    }
  } else if (empties.length) {
    console.log('   (empties left in place — add --delete-empty <collection-id> to remove specific empties)');
  }
  console.log('\n   ✅ Done.\n');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
