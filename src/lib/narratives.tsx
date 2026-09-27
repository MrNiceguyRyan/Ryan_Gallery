import type { Photo } from '../types';

/**
 * Sanity photo titles have historically arrived as both strings and portable
 * text-like values. Keep that inconsistency at the data boundary so no view
 * can accidentally expose "[object Object]" to visitors or assistive tech.
 */
function readableText(value: unknown, depth = 0): string {
  if (depth > 3 || value == null) return '';
  if (typeof value === 'string') {
    // Once object serialization has leaked into a title, the surrounding
    // characters are no longer trustworthy (for example, a frame number may
    // have been concatenated twice). Prefer the factual positional fallback.
    if (/\[object Object\]/i.test(value)) return '';
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized && /[\p{L}\p{N}]/u.test(normalized) ? normalized : '';
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => readableText(item, depth + 1))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  for (const key of ['text', 'title', 'caption', 'alt', 'name', 'en']) {
    const candidate = readableText(record[key], depth + 1);
    if (candidate) return candidate;
  }
  return readableText(record.children, depth + 1);
}

export function photoDisplayTitle(photo: Pick<Photo, 'title'>): string {
  return readableText(photo.title);
}

/**
 * A photograph's written description, or '' when nobody has written one.
 *
 * There is no separate caption field: the Sanity `title` doubles as the
 * description, and today every one of them is machine-made — `Miami #24`,
 * `Bryce Canyon #05`, a filename-like `NY` or `NY_2`, and on the Page chapter a
 * serialized `Page #[object Object],…101` (which `readableText` already
 * reduces to ''). Those read as filenames, not captions, so they are treated
 * as "not written yet". Replace a title in Sanity with real words and it
 * becomes the caption on its own — no schema change, no deploy of code.
 */
export function photoDescription(photo: Pick<Photo, 'title'>): string {
  const title = photoDisplayTitle(photo);
  if (!title) return '';
  if (/#\s*\S*\d+\s*$/.test(title)) return '';
  if (/^[A-Za-z]{1,6}[_-]\d+$/.test(title)) return '';
  // A bare abbreviation is a file's stem too (New York's first frame is "NY",
  // its second "NY_2"): nobody writes a caption in two capitals.
  if (/^[A-Z]{1,3}$/.test(title)) return '';
  return title;
}

/** A unique, position-aware label shared by the story grid and lightbox. */
export function photoAccessibleLabel(
  photo: Pick<Photo, 'title'>,
  index: number,
  total: number,
  collectionName?: string,
): string {
  const position = `Photo ${index + 1} of ${Math.max(total, 1)}`;
  // A written description only — "Miami #24" is a filename, not a name.
  const title = photoDescription(photo);
  if (title) return `${position}, ${title}`;
  if (collectionName) return `${position}, ${collectionName}`;
  return position;
}

/**
 * Per-collection editorial fallbacks. Used when Sanity has no
 * `introduction` field populated. Keyed by collection slug.
 *
 * These are kept in sync between MagazineLayout (homepage overlay)
 * and WorkDetailPage (full /works/[slug] page) so both surfaces
 * read the same narrative without duplication.
 */
export const EDITORIAL_FALLBACKS: Record<string, string[]> = {
  'new-york-stories': [
    'Manhattan light arrives sideways in the early hours, cutting between towers in long amber slabs that catch the steam rising from grates and the grime on fire escapes. By mid-morning the city is already hard-edged, every surface asserting itself.',
    'Dusk compresses the borough into silhouette: water towers against violet sky, headlights smearing the wet street into something almost painterly. There is no softness here, only different kinds of contrast.',
  ],
  'page': [
    'Inside Antelope Canyon the sandstone narrows until sound itself seems muffled. The walls have been smoothed by centuries of flash floods into curves that read more like fabric than rock — ochre folding into deep burgundy wherever a shaft of noon light finds the floor.',
    'That light lasts minutes. It enters as a column, diffuse at the edges, and illuminates suspended dust so finely that the air appears solid. What remains is pure geological time rendered in color.',
  ],
  'zion-national-park': [
    'The Virgin River runs cold and milky green through the canyon bottom, its sound constant and indifferent to the walls rising nearly a thousand meters on either side. In morning shadow the sandstone is the color of dried blood; by noon it goes copper.',
    'What Zion enforces is a reckoning with scale. A single wall of Navajo sandstone erases the horizon and replaces it with texture — cross-bedded strata reading like handwriting from some earlier world.',
  ],
  'arizona': [
    'The Sonoran at midday offers almost nothing to hide behind. Saguaro cast shadows barely wider than a hand, and the sky is so bleached it reads white rather than blue. The silence here has weight — oppressive to some, clarifying to others.',
    'Dawn is the negotiation: the moment when the land is still cool and the light has not yet gone harsh, when long shadows of rock formations stretch west and the desert floor shows all its texture.',
  ],
  'orlando': [
    'Florida afternoon light is relentless and democratic — it flattens shadows, bleaches signage, and turns every surface equally bright. In the parks it catches the spray of fountains in small prismatic bursts, indifferent to anything beneath it.',
    'Away from the spectacle, Orlando is a city of retention ponds and palm trees bending in afternoon thunderstorm wind while the pavement still steams. The transition between the engineered and the accidental happens fast here.',
  ],
  'bryce-canyon-national-park': [
    'The hoodoos at Bryce form a kind of frozen congregation — thousands of pink limestone spires standing close together, the tallest capped with harder dolomite that protected them while everything around eroded away. In fresh snow they are almost surreal.',
    'Sunrise on the rim produces the most compressed range of tone — deep blue shadow filling the canyon floor, the spires above catching first light in amber and rust, the sky at the horizon going briefly gold before the whole amphitheater normalizes.',
  ],
  'miami': [
    'Ocean Drive at dusk exists in two registers simultaneously: the pastel geometry of Art Deco facades going soft in the last natural light, and the neon beginning its slow assertion against the darkening sky. The sidewalk retains the day\'s heat long after the sun has gone.',
    'South Beach operates on a logic of surfaces — the gloss of a rental car hood, reflections in hotel lobby glass, the particular turquoise of the Atlantic at noon when the sand below is still visible and the water seems lit from within.',
  ],
};

/**
 * Short, complete homepage captions. These deliberately do not reuse the
 * longer story introductions: the homepage only needs one clear observation
 * per place, while the full narrative belongs inside the story view.
 */
export const HOMEPAGE_CAPTIONS: Record<string, string> = {
  'new-york-stories': 'Early light cuts between Manhattan towers, revealing steam, steel, and the texture of the street.',
  page: 'Inside Antelope Canyon, sandstone folds a few minutes of noon light into color.',
  'zion-national-park': 'The Virgin River threads beneath sandstone walls that erase the horizon.',
  arizona: 'Desert light strips the landscape back to shadow, stone, and open distance.',
  orlando: 'Florida light holds spectacle and ordinary streets in the same bright register.',
  'bryce-canyon-national-park': 'At sunrise, thousands of hoodoos move from blue shadow into amber light.',
  miami: 'Ocean Drive holds pastel facades and the first glow of neon in the same frame.',
};

export function homepageCaption(slug: string | undefined): string {
  return (slug && HOMEPAGE_CAPTIONS[slug]) || '';
}

/** A story's dek — the standfirst under its title on the opening spread. The
 *  homepage's one-line caption of the place, set as the story's own. */
export const storyDek = homepageCaption;

/**
 * One sentence per story, lifted from its own narrative (EDITORIAL_FALLBACKS)
 * for the pull quote's page, trimmed at a dash and printed without its final
 * period. Existing text only. Bryce Canyon and New York have none: their
 * stories are too short for a quote page.
 */
export const PULL_QUOTES: Record<string, string> = {
  miami: 'South Beach operates on a logic of surfaces',
  orlando: 'The transition between the engineered and the accidental happens fast here',
  page: 'That light lasts minutes',
  'zion-national-park': 'What Zion enforces is a reckoning with scale',
};

export function pullQuote(slug: string | undefined): string {
  return (slug && PULL_QUOTES[slug]) || '';
}

/** The credit the terrain maps carry: the story reprints it wherever a map is
 *  cropped past its own corner notice. */
export const MAP_CREDIT = 'terraink.app · © OpenStreetMap contributors';

/** First-paragraph excerpt of a collection's editorial fallback, truncated to
 *  ~n chars at a word boundary with an ellipsis. Empty when there's no fallback.
 *  The canonical source of homepage editorial copy (Sanity `introduction` is
 *  empty), shared by the ArchiveChapter feature spread and any future strip. */
export function excerpt(slug: string | undefined, n = 170): string {
  const full = (slug && EDITORIAL_FALLBACKS[slug]?.[0]) || '';
  if (full.length <= n) return full;
  const cut = full.slice(0, n);
  const lastSpace = cut.lastIndexOf(' ');
  return cut.slice(0, lastSpace > 0 ? lastSpace : n).trimEnd() + '…';
}
