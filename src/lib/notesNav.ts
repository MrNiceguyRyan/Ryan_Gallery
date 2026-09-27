// ── Whether the nav carries NOTES ──
// Decided once per build, before any page renders: astro.config.mjs counts
// the published notes in Sanity (or honours the preview-only NOTES_SAMPLE=1)
// and defines __NOTES_LIVE__ for the server and the client bundles alike, so
// every page's nav — and the homepage's own copy of it — agree, and the
// server HTML and the hydrated island print the same pills. With no note
// published there is no NOTES pill anywhere; the first one brings it.
declare const __NOTES_LIVE__: boolean | undefined;

export const NOTES_LIVE: boolean = typeof __NOTES_LIVE__ !== 'undefined' && __NOTES_LIVE__ === true;
