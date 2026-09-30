// ─── Shared TypeScript interfaces ───

import type { ChapterInput } from './lib/storyChapters';

export interface TimelineItem {
  year: string;
  title: string;
  description: string;
}

export interface SiteSettings {
  name?: string;
  bio?: string;
  /** Chinese twins and the PROPOSED lines (src/i18n/content.ts siteText). */
  bioZh?: string;
  lede?: string;
  ledeZh?: string;
  tagline?: string;
  taglineZh?: string;
  notesDek?: string;
  notesDekZh?: string;
  particulars?: Array<{ term?: string; termZh?: string; value?: string; valueZh?: string }>;
  avatarUrl?: string;
  email?: string;
  instagram?: string;
  timeline?: TimelineItem[];
}

/** Portable Text block from Sanity */
export interface PortableTextBlock {
  _type: 'block';
  _key: string;
  style?: 'normal' | 'blockquote';
  children: Array<{
    _type: 'span';
    _key: string;
    text: string;
    marks?: string[];
  }>;
}

export interface Collection {
  _id: string;
  name: string;
  slug: string;
  subtitle?: string;
  coverImageUrl: string;
  location?: string;
  /** Region/cluster label (e.g. "Florida", "Arizona", "DMV"). Used by the
   *  homepage to group multi-place regions into a single region chapter/hub. */
  region?: string;
  year?: number;
  /** Optional editorial route position. Existing collections may omit it;
   *  the homepage keeps their current order until the route is fully ordered. */
  routeOrder?: number;
  /** Canonical map point for the collection. Sanity geopoints use lng/lat. */
  mapLocation?: {
    _type?: 'geopoint';
    lat: number;
    lng: number;
    alt?: number;
  };
  description?: string;
  /** Portable Text — editorial introduction shown in the collection sidebar */
  introduction?: PortableTextBlock[];
  /** Optional sub-chapters inside the story (Sanity `chapters`): each a
   *  title, kicker, intro and its photographs as ids, which the story groups
   *  among `photos` (src/lib/storyChapters.ts). Null or absent: none. */
  chapters?: ChapterInput[] | null;
  photos?: Photo[];
  photoCount?: number;
  /* ── 中文: each field's Chinese twin, resolved at build time by
     src/i18n/content.ts withZh (Sanity's …Zh, else our draft, else absent:
     the page prints the English). ── */
  nameZh?: string;
  subtitleZh?: string;
  locationZh?: string;
  regionZh?: string;
  descriptionZh?: string;
  /** Plain paragraphs once resolved (Sanity sends Portable Text). */
  introductionZh?: string[] | PortableTextBlock[];
  /** The homepage caption / story standfirst (English: Sanity, else code). */
  dek?: string;
  dekZh?: string;
  pullQuote?: string;
  pullQuoteZh?: string;
}

export interface Photo {
  _id: string;
  title: string;
  imageUrl: string;
  /** Image natural dimensions from Sanity asset metadata */
  width?: number;
  height?: number;
  camera?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: string;
  collection?: {
    name: string;
    slug: string;
    region?: string;
    /** The chapter's place in the archive's reading order, so surfaces other
     *  than the homepage can present places in that order too. */
    routeOrder?: number;
    year?: number | string;
  };
  styleCategory?: string;
  location?: {
    lat: number;
    lng: number;
    city?: string;
    /** The place in Chinese (Sanity location.cityZh, else our draft). */
    cityZh?: string;
    country?: string;
  };
}
