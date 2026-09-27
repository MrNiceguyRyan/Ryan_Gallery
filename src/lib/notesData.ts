// ── Notes: the build's one read ──
// /notes and every /notes/<slug> read the same list, so it is fetched once per
// build and shared. With nothing published the section is empty: /notes is a
// quiet page nothing links to and the nav has no NOTES (astro.config.mjs
// decides that from the same count). For a PREVIEW build only, NOTES_SAMPLE=1
// prints one clearly labelled sample built from text already on the site, so
// the owner can see the design before he writes. Production never sets it.
import { sanityClient } from 'sanity:client';
import { fetchSanityWithRetry } from './sanityFetch';
import { EDITORIAL_FALLBACKS, HOMEPAGE_CAPTIONS } from './narratives';
import { NOTES_QUERY, normalizeNotes, type Note, type NoteBodyBlock, type NoteImage } from './notes';

export interface NotesLoad {
  notes: Note[];
  /** True when the list is the preview sample, not his writing. */
  sample: boolean;
}

export const SAMPLE_SLUG = 'sample';

let pending: Promise<NotesLoad> | null = null;

export function loadNotes(): Promise<NotesLoad> {
  pending ??= readNotes();
  return pending;
}

async function readNotes(): Promise<NotesLoad> {
  const raw = await fetchSanityWithRetry(() => sanityClient.fetch<unknown[]>(NOTES_QUERY));
  const notes = normalizeNotes(raw as Parameters<typeof normalizeNotes>[0]);
  if (notes.length > 0 || process.env.NOTES_SAMPLE !== '1') return { notes, sample: false };
  const sample = await sampleNote();
  return { notes: sample ? [sample] : [], sample: Boolean(sample) };
}

// ─── The preview sample ─────────────────────────────────────────────────
// Every sentence is one the site already prints: the title is /about's lede,
// the opening two paragraphs are /about's bio (AboutPage.tsx, the text shown
// while siteSettings.bio is empty), the dek is the homepage caption for Page,
// the rest is Page's story narrative (src/lib/narratives.tsx) and its pull
// quote is the one the Story rebuild quotes. The pictures are Page's own
// frames. Nothing here is his reflection — it is a layout specimen.

const ABOUT_LEDE = 'Cities and landscapes, one frame at a time';
const ABOUT_BIO = [
  'A photographic record of moving through cities and landscapes, from the high-contrast geometry of Manhattan to the geologic time of the American Southwest. No commissioned work, no client briefs. Frames selected on a slow timeline, organized by location, dated.',
  'Off the camera: engineering and AI research. The discipline of careful observation transfers between the two; both reward patience over output volume. This site is one node in a personal archive, not a portfolio for hire.',
];
const SAMPLE_PLACE = 'page';

interface SamplePlace {
  slug: string;
  name: string;
  region?: string | null;
  year?: number | string | null;
  coverImageUrl?: string | null;
  coverWidth?: number | null;
  coverHeight?: number | null;
  photos?: Array<{ url?: string; width?: number; height?: number; city?: string | null }>;
}

let keyCount = 0;
const key = () => `sample-${(keyCount += 1)}`;

function paragraph(text: string, style = 'normal', italic: string[] = []): NoteBodyBlock {
  // Italic runs are marked on the existing words only (a layout specimen of
  // the em mark); the text itself is unchanged.
  const children: Array<{ _type: 'span'; _key: string; text: string; marks: string[] }> = [];
  let rest = text;
  for (const phrase of italic) {
    const at = rest.indexOf(phrase);
    if (at < 0) continue;
    if (at > 0) children.push({ _type: 'span', _key: key(), text: rest.slice(0, at), marks: [] });
    children.push({ _type: 'span', _key: key(), text: phrase, marks: ['em'] });
    rest = rest.slice(at + phrase.length);
  }
  if (rest) children.push({ _type: 'span', _key: key(), text: rest, marks: [] });
  return { _type: 'block', _key: key(), style, children, markDefs: [] } as NoteBodyBlock;
}

function assetImage(url: string, width: number, height: number, alt: string, caption?: string): NoteImage {
  return { asset: { url, width, height }, alt, caption: caption ?? null, crop: null, hotspot: null };
}

async function sampleNote(): Promise<Note | null> {
  const place = await fetchSanityWithRetry(() => sanityClient.fetch<SamplePlace | null>(`
    *[_type == "collection" && slug.current == $slug][0] {
      "slug": slug.current,
      name,
      region,
      year,
      "coverImageUrl": coverImage.asset->url,
      "coverWidth": coverImage.asset->metadata.dimensions.width,
      "coverHeight": coverImage.asset->metadata.dimensions.height,
      "photos": *[_type == "photo" && references(^._id)] | order(_createdAt desc) {
        "url": image.asset->url,
        "width": image.asset->metadata.dimensions.width,
        "height": image.asset->metadata.dimensions.height,
        "city": location.city
      }
    }
  `, { slug: SAMPLE_PLACE }));
  if (!place?.slug) return null;

  const [lede, second] = EDITORIAL_FALLBACKS[SAMPLE_PLACE] ?? [];
  const where = [place.name, place.region].filter(Boolean).join(', ');
  // A landscape frame for the inline picture, so the page shows both kinds:
  // the portrait cover under the title and a landscape plate in the text.
  const landscape = (place.photos ?? []).find(
    (photo) => photo.url && photo.width && photo.height && photo.width > photo.height && photo.url !== place.coverImageUrl,
  );
  const quote = second?.split(/(?<=\.)\s/)[0];

  // The pull quote is lifted from the last paragraph and hung well before
  // it (the magazine's rule: never beside its own sentence).
  const body: NoteBodyBlock[] = [
    paragraph(ABOUT_BIO[0]),
    paragraph(ABOUT_BIO[1]),
    ...(quote ? [{ _type: 'pullQuote', _key: key(), text: quote, attribution: null } as NoteBodyBlock] : []),
    paragraph(where, 'h2'),
    ...(lede ? [paragraph(lede, 'normal', ['Antelope Canyon'])] : []),
    ...(landscape?.url && landscape.width && landscape.height
      ? [{ _type: 'image', _key: key(), ...assetImage(landscape.url, landscape.width, landscape.height, where, [landscape.city, place.region].filter(Boolean).join(', ')) } as NoteBodyBlock]
      : []),
    ...(second ? [paragraph(second)] : []),
  ];

  return {
    _id: 'sample',
    title: ABOUT_LEDE,
    slug: SAMPLE_SLUG,
    publishedAt: new Date().toISOString(),
    dek: HOMEPAGE_CAPTIONS[SAMPLE_PLACE] ?? null,
    cover:
      place.coverImageUrl && place.coverWidth && place.coverHeight
        ? assetImage(place.coverImageUrl, place.coverWidth, place.coverHeight, where)
        : null,
    places: [
      {
        slug: place.slug,
        name: place.name,
        region: place.region,
        year: place.year,
        coverImageUrl: place.coverImageUrl,
        coverWidth: place.coverWidth,
        coverHeight: place.coverHeight,
      },
    ],
    body,
    featured: true,
    sample: true,
  };
}
