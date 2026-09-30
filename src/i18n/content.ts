// ── His content in Chinese: one read rule ──
// A field's Chinese is, in order: its …Zh twin in Sanity (he writes or
// pastes it in the Studio: ryan/schemaTypes), else our draft
// (src/i18n/contentDrafts.ts) — but only while the English it translates is
// still the English on the page — else nothing, and the page prints the
// English. Resolved once per build, where the pages fetch (withZh), so every
// island reads plain `collection.nameZh` / `photo.location.cityZh` and the
// server HTML carries both languages (src/i18n/runtime.ts).

import type { Collection, Photo, PortableTextBlock } from '../types';
import { CITY_ZH, COLLECTION_DRAFTS, REGION_ZH, SITE_DRAFTS, type TextDraft } from './contentDrafts.ts';
import { EDITORIAL_FALLBACKS, HOMEPAGE_CAPTIONS, PULL_QUOTES } from '../lib/narratives';

const norm = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** A Sanity string, trimmed; '' for anything else (an object that leaked
 *  into a string field prints nothing, never "[object Object]"). */
export function plain(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Portable Text (or a list of strings) as plain paragraphs. */
export function paragraphsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((block) => {
      if (typeof block === 'string') return block.trim();
      const children = (block as PortableTextBlock | null)?.children;
      return Array.isArray(children) ? children.map((span) => (typeof span?.text === 'string' ? span.text : '')).join('').trim() : '';
    })
    .filter(Boolean);
}

/** One text field's Chinese: Sanity's own, else our draft while its English
 *  is still the page's, else undefined (the page prints the English). */
export function zhText(own: unknown, en: unknown, draft?: TextDraft): string | undefined {
  const written = plain(own);
  if (written) return written;
  if (draft && norm(draft.en) && norm(draft.en) === norm(en)) return draft.zh;
  return undefined;
}

/** A region's Chinese (the states carry 州). */
export function regionZh(region: unknown, own?: unknown): string | undefined {
  const written = plain(own);
  if (written) return written;
  const key = plain(region);
  return key ? REGION_ZH[key] : undefined;
}

/** A photograph's own place in Chinese. */
export function cityZh(city: unknown, own?: unknown): string | undefined {
  const written = plain(own);
  if (written) return written;
  const key = plain(city);
  return key ? CITY_ZH[key] : undefined;
}

/** The fields a collection carries in Chinese once resolved. */
export interface CollectionZh {
  nameZh?: string;
  subtitleZh?: string;
  locationZh?: string;
  regionZh?: string;
  descriptionZh?: string;
  /** The story's words: Sanity's introductionZh, else our draft while the
   *  English story is the one the code prints. Plain paragraphs. */
  introductionZh?: string[];
  /** The homepage caption / the story's standfirst (English: Sanity `dek`,
   *  else src/lib/narratives.tsx). */
  dek?: string;
  dekZh?: string;
  /** The story's pull quote (a verbatim substring of its paragraph). */
  pullQuote?: string;
  pullQuoteZh?: string;
}

/** Resolve a fetched collection's Chinese, and its photographs' places.
 *  Everything English is left exactly as fetched. */
export function withZh<T extends Partial<Collection>>(input: T): T & CollectionZh {
  if (!input || typeof input !== 'object') return input as T & CollectionZh;
  const collection = input as T & Record<string, unknown>;
  const id = plain(collection._id);
  const slug = plain(collection.slug);
  const draft = COLLECTION_DRAFTS[id] ?? Object.values(COLLECTION_DRAFTS).find((entry) => entry.slug === slug);
  const out = { ...input } as T & CollectionZh;
  if ('name' in collection) out.nameZh = zhText(collection.nameZh, collection.name, draft?.name);
  if ('subtitle' in collection) out.subtitleZh = zhText(collection.subtitleZh, collection.subtitle, draft?.subtitle);
  if ('location' in collection) out.locationZh = zhText(collection.locationZh, collection.location, draft?.location);
  if ('region' in collection) out.regionZh = regionZh(collection.region, collection.regionZh) ?? zhText(undefined, collection.region, draft?.region);
  if ('description' in collection) out.descriptionZh = zhText(collection.descriptionZh, collection.description, draft?.description);
  if ('introduction' in collection || 'introductionZh' in collection) {
    const own = paragraphsOf(collection.introductionZh);
    const englishOnPage = paragraphsOf(collection.introduction);
    const codeStory = slug ? EDITORIAL_FALLBACKS[slug] ?? [] : [];
    const draftFits = !!draft?.introduction && englishOnPage.length === 0
      && norm(draft.introduction.en.join(' ')) === norm(codeStory.join(' '));
    out.introductionZh = own.length ? own : draftFits ? draft!.introduction!.zh : undefined;
  }
  // The dek and the pull quote live in code today (narratives.tsx); a
  // Sanity `dek` / `pullQuote` of his replaces them in both languages.
  const dek = plain(collection.dek) || (slug ? HOMEPAGE_CAPTIONS[slug] ?? '' : '');
  out.dek = dek || undefined;
  out.dekZh = zhText(collection.dekZh, dek, draft?.dek);
  const quote = plain(collection.pullQuote) || (slug ? PULL_QUOTES[slug] ?? '' : '');
  out.pullQuote = quote || undefined;
  out.pullQuoteZh = zhText(collection.pullQuoteZh, quote, draft?.pullQuote);
  if (Array.isArray(collection.photos)) {
    (out as Partial<Collection>).photos = (collection.photos as Photo[]).map((photo) => withPhotoZh(photo));
  }
  return out;
}

/** A photograph with its place's Chinese resolved (location.cityZh). */
export function withPhotoZh<P extends Pick<Photo, 'location'>>(photo: P): P {
  const location = photo?.location;
  if (!location || typeof location !== 'object') return photo;
  const zh = cityZh(location.city, (location as { cityZh?: unknown }).cityZh);
  return zh ? { ...photo, location: { ...location, cityZh: zh } } : photo;
}

/** Apply withZh to a fetched list (a failed fetch passes through). */
export function allWithZh<T extends Partial<Collection>>(list: T[] | null | undefined): Array<T & CollectionZh> {
  return Array.isArray(list) ? list.map((item) => withZh(item)) : [];
}

/** The siteSettings prose in both languages: his Sanity fields when he has
 *  written them (with their …Zh twins), else the page's own English and our
 *  drafts. */
export interface SiteText {
  bio: { en: string[]; zh?: string[] };
  lede: { en: string; zh?: string };
  tagline: { en: string; zh?: string };
  notesDek: { en: string; zh?: string };
  particulars: Array<{ term: string; termZh?: string; value: string; valueZh?: string }>;
}

export function siteText(settings: Record<string, unknown> | null | undefined): SiteText {
  const s = settings ?? {};
  const splitParas = (value: unknown) => plain(value).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const bioEn = splitParas(s.bio);
  const bioZh = splitParas(s.bioZh);
  const bio = bioEn.length
    ? { en: bioEn, zh: bioZh.length ? bioZh : norm(bioEn.join(' ')) === norm(SITE_DRAFTS.bio.en.join(' ')) ? SITE_DRAFTS.bio.zh : undefined }
    : { en: SITE_DRAFTS.bio.en, zh: bioZh.length ? bioZh : SITE_DRAFTS.bio.zh };
  const line = (field: 'lede' | 'tagline' | 'notesDek') => {
    const en = plain(s[field]) || SITE_DRAFTS[field].en;
    return { en, zh: zhText(s[`${field}Zh`], en, SITE_DRAFTS[field]) };
  };
  const written = Array.isArray(s.particulars)
    ? (s.particulars as Array<Record<string, unknown>>)
        .map((row) => ({ term: plain(row?.term), termZh: plain(row?.termZh) || undefined, value: plain(row?.value), valueZh: plain(row?.valueZh) || undefined }))
        .filter((row) => row.term && row.value)
    : [];
  return {
    bio,
    lede: line('lede'),
    tagline: line('tagline'),
    notesDek: line('notesDek'),
    particulars: written.length ? written : SITE_DRAFTS.particulars,
  };
}

/** The GROQ projection of a collection's Chinese twins (both languages are
 *  fetched: a static build prints both). */
export const COLLECTION_ZH_FIELDS = 'nameZh, subtitleZh, locationZh, regionZh, descriptionZh, introductionZh, dek, dekZh, pullQuote, pullQuoteZh';
