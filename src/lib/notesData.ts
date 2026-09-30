// ── Notes: the build's one read ──
// /notes and every /notes/<slug> read the same list, so it is fetched once per
// build and shared. With nothing published the section is empty: /notes is a
// quiet page nothing links to and the nav has no NOTES (astro.config.mjs
// decides that from the same count). For a PREVIEW build only, NOTES_SAMPLE=1
// prints one clearly labelled sample built from text already on the site, so
// the owner can see the design before he writes. Production never sets it.
// 中 / EN: each note's own Chinese (titleZh, dekZh, bodyZh …) comes with it
// (NOTES_QUERY, normalizeNotes); the chapters it is about get their Chinese
// names here, as every other page gets them (src/i18n/content.ts).
import { sanityClient } from 'sanity:client';
import { fetchSanityWithRetry } from './sanityFetch';
import { EDITORIAL_FALLBACKS, HOMEPAGE_CAPTIONS } from './narratives';
import { NOTES_QUERY, normalizeNotes, type Note, type NoteBodyBlock, type NoteImage, type NotePlace } from './notes';
import { cityZh, siteText, withZh } from '../i18n/content';

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
  const notes = normalizeNotes(raw as Parameters<typeof normalizeNotes>[0]).map((note) => ({
    ...note,
    places: note.places.map(placeWithZh),
  }));
  if (notes.length > 0 || process.env.NOTES_SAMPLE !== '1') return { notes, sample: false };
  const sample = await sampleNote();
  return { notes: sample ? [sample] : [], sample: Boolean(sample) };
}

/** A chapter's name and region in Chinese: its Sanity …Zh, else our draft
 *  while its English is the one on the page (withZh). */
function placeWithZh<P extends NotePlace>(place: P): P {
  const zh = withZh({ slug: place.slug, name: place.name, region: place.region ?? undefined, nameZh: place.nameZh, regionZh: place.regionZh } as Parameters<typeof withZh>[0]);
  return { ...place, nameZh: zh.nameZh ?? null, regionZh: place.region ? zh.regionZh ?? null : null };
}

// ─── The preview sample ─────────────────────────────────────────────────
// Every sentence is one the site already prints: the title is /about's lede,
// the opening two paragraphs are /about's bio (the text it shows while
// siteSettings.bio is empty), the dek is the homepage caption for Page, the
// rest is Page's story narrative (src/lib/narratives.tsx) and its pull quote
// is the one the Story rebuild quotes. The pictures are Page's own frames.
// Nothing here is his reflection — it is a layout specimen. Its Chinese
// (titleZh, dekZh, bodyZh) is the same sentences' Chinese as the site
// prints them (src/i18n/content.ts), so the preview also shows a note with
// its Chinese twins, which nothing published can show yet.

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

function assetImage(url: string, width: number, height: number, alt: string, caption?: string, altZh?: string): NoteImage {
  return { asset: { url, width, height }, alt, caption: caption ?? null, altZh: altZh ?? null, crop: null, hotspot: null };
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

  // The same sentences in Chinese, as the site prints them: the chapter's
  // (the story Page's page prints, while it is the code's), /about's.
  // withZh reads the story's Chinese only for a chapter whose English story
  // is the code's, which is the one this sample quotes.
  const zh = withZh({ slug: place.slug, name: place.name, region: place.region ?? undefined, introduction: [] } as Parameters<typeof withZh>[0]);
  const site = siteText(null);
  const [ledeZh, secondZh] = zh.introductionZh ?? [];
  const whereZh = [zh.nameZh ?? place.name, zh.regionZh ?? place.region].filter(Boolean).join('，');
  const quoteZh = secondZh?.split(/(?<=。)/)[0];
  const captionZh = landscape ? [cityZh(landscape.city) ?? landscape.city, zh.regionZh ?? place.region].filter(Boolean).join('，') : '';
  const bioZh = site.bio.zh ?? [];

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
  // The Chinese body: the same plan, in the same order.
  const bodyZh: NoteBodyBlock[] | null =
    bioZh.length >= 2 && ledeZh && secondZh
      ? [
          paragraph(bioZh[0]),
          paragraph(bioZh[1]),
          ...(quoteZh ? [{ _type: 'pullQuote', _key: key(), text: quoteZh, attribution: null } as NoteBodyBlock] : []),
          paragraph(whereZh, 'h2'),
          paragraph(ledeZh, 'normal', ['羚羊峡谷']),
          ...(landscape?.url && landscape.width && landscape.height
            ? [{ _type: 'image', _key: key(), ...assetImage(landscape.url, landscape.width, landscape.height, whereZh, captionZh) } as NoteBodyBlock]
            : []),
          paragraph(secondZh),
        ]
      : null;

  return {
    _id: 'sample',
    title: ABOUT_LEDE,
    titleZh: site.lede.zh?.replace(/。$/, '') || null,
    slug: SAMPLE_SLUG,
    publishedAt: new Date().toISOString(),
    dek: HOMEPAGE_CAPTIONS[SAMPLE_PLACE] ?? null,
    dekZh: HOMEPAGE_CAPTIONS[SAMPLE_PLACE] ? zh.dekZh ?? null : null,
    cover:
      place.coverImageUrl && place.coverWidth && place.coverHeight
        ? assetImage(place.coverImageUrl, place.coverWidth, place.coverHeight, where, undefined, whereZh)
        : null,
    places: [
      {
        slug: place.slug,
        name: place.name,
        nameZh: zh.nameZh ?? null,
        region: place.region,
        regionZh: zh.regionZh ?? null,
        year: place.year,
        coverImageUrl: place.coverImageUrl,
        coverWidth: place.coverWidth,
        coverHeight: place.coverHeight,
      },
    ],
    body,
    bodyZh,
    featured: true,
    sample: true,
  };
}
