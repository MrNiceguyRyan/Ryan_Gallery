// ── /about's counts: the chapters, the frames and the bodies that made them ──
// The correspondence ticket's stub and the colophon's "Cameras" line are
// reduced here from the frames themselves at build time (about.astro), so
// neither can be wrong by hand and both grow as chapters land. Pure;
// scripts/exposure-record.test.mjs holds it against a fixture of the archive.
//
// The camera arrives as Sanity stores it: makers' strings ("NIKON
// CORPORATION NIKON Z f" on some frames, "Nikon Zf" on others — counting raw
// would report three bodies for two cameras).

export interface RecordPhoto {
  camera?: string | null;
}

export interface RecordChapter {
  photos?: ReadonlyArray<RecordPhoto> | null;
}

export interface ExposureTotals {
  chapters: number;
  frames: number;
  /** The bodies, most frames first. */
  bodies: string[];
}

/** "NIKON CORPORATION NIKON Z f" → "Nikon Zf"; "FUJIFILM X-T50" → "Fujifilm X-T50". */
export function tidyCamera(raw?: string | null) {
  if (!raw) return null;
  const value = raw.replace(/NIKON CORPORATION\s+/i, '').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  return /nikon z\s*f/i.test(value) ? 'Nikon Zf' : value.replace(/^FUJIFILM\s+/i, 'Fujifilm ');
}

function countBy<T>(items: readonly T[], key: (item: T) => string | null) {
  const out = new Map<string, number>();
  items.forEach((item) => {
    const k = key(item);
    if (k) out.set(k, (out.get(k) ?? 0) + 1);
  });
  // Most first; equals keep the order they were first met in.
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * The counts for the chapters as given — pass the homepage's chapters
 * (src/lib/chapterOrder.ts) so "06 chapters" is the homepage's six.
 */
export function exposureTotals(chapters: readonly RecordChapter[]): ExposureTotals {
  const all = chapters.flatMap((chapter) => chapter.photos ?? []);
  return {
    chapters: chapters.length,
    frames: all.length,
    bodies: countBy(all, (p) => tidyCamera(p.camera)).map(([name]) => name),
  };
}
