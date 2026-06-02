// ─── Shared TypeScript interfaces ───

export interface TimelineItem {
  year: string;
  title: string;
  description: string;
}

export interface SiteSettings {
  name?: string;
  bio?: string;
  avatarUrl?: string;
  email?: string;
  instagram?: string;
  skills?: string[];
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

/** A single swatch from Sanity's automatic image palette extraction.
 *  Sanity computes one of these for every uploaded image, surfaced via
 *  `image.asset->metadata.palette`. We use the `.background` hex for tinting. */
export interface SanityPaletteSwatch {
  background: string;
  foreground: string;
  population: number;
  title?: string;
}

/** Full palette: seven swatches Sanity provides. Any may be null when the
 *  image lacks pixels matching that quality (e.g. monochrome photos often
 *  have no `vibrant`). */
export interface SanityImagePalette {
  darkMuted?: SanityPaletteSwatch | null;
  darkVibrant?: SanityPaletteSwatch | null;
  dominant?: SanityPaletteSwatch | null;
  lightMuted?: SanityPaletteSwatch | null;
  lightVibrant?: SanityPaletteSwatch | null;
  muted?: SanityPaletteSwatch | null;
  vibrant?: SanityPaletteSwatch | null;
}

export interface Collection {
  _id: string;
  name: string;
  slug: string;
  subtitle?: string;
  coverImageUrl: string;
  /** Auto-extracted color palette of the cover image. Used by the homepage
   *  to drive a per-chapter accent color crossfade. */
  palette?: SanityImagePalette | null;
  location?: string;
  /** Region/cluster label (e.g. "Florida", "Arizona", "DMV"). Used by the
   *  homepage to group multi-place regions into a single region chapter/hub. */
  region?: string;
  year?: number;
  description?: string;
  /** Portable Text — editorial introduction shown in the collection sidebar */
  introduction?: PortableTextBlock[];
  liveProjectUrl?: string;
  photos?: Photo[];
  gridSize: 'large' | 'medium' | 'small';
  photoCount?: number;
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
  };
  styleCategory?: string;
  location?: {
    lat: number;
    lng: number;
    city?: string;
    country?: string;
  };
}
