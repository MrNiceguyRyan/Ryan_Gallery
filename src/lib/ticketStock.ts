import type { CSSProperties } from 'react';

// ── Ticket stock: one card per chapter ──
// Every paper object the archive prints — the homepage ticket and its pad,
// the Story rail's kept stub, the phone stub, the closing proof stubs, the
// globe's ADMIT ONE ticket — is printed on its chapter's own card, so a torn
// stub and the next ticket read as two tickets. The hue is picked by hand
// from the chapter's cover (sampled palettes put four chapters on one sky
// blue); every stock sits in one dark band (OKLCH L 0.34–0.385, C ≤ 0.063),
// like the olive matte it replaces, so the photograph stays the brightest
// thing on every ticket. No stock is lime or yellow-green: lime is interface.
//
// Only the paper changes per chapter. The ink is constant bone at fixed
// alphas (the --stub-ink / --stub-strong / --stub-muted / --stub-rule tokens
// on :root in global.css), measured ≥ 4.5:1 for the muted labels on every
// stock. Set the paper inline on a paper object's root with `stockStyle` and
// let everything printed on it inherit. scripts/ticket-stock.test.mjs holds a
// new or retuned stock to all of this (contrast, band, no lime, ΔE apart).
export const TICKET_STOCK: Readonly<Record<string, string>> = {
  miami: '#562f2e', // dusk rose — the pink dusk sky
  orlando: '#223b55', // night blue
  page: '#492d43', // plum — Antelope Canyon's mauve
  'zion-national-park': '#20423a', // deep teal — the scrub and the river
  'bryce-canyon-national-park': '#593d1b', // ochre card — the amber rock
  'new-york-stories': '#35383e', // slate — stone and street
};
/** Today's olive matte, for any chapter the table does not know yet. */
export const STOCK_FALLBACK = '#30352a';
/** Held back for a seventh chapter (indigo). */
export const STOCK_RESERVE = ['#353050'] as const;

export function stockPaper(slug?: string | null) {
  return (slug && TICKET_STOCK[slug]) || STOCK_FALLBACK;
}

/** The inline style that prints a paper object on its chapter's stock. */
export function stockStyle(slug?: string | null): CSSProperties {
  return { ['--stub-paper' as string]: stockPaper(slug) } as CSSProperties;
}
