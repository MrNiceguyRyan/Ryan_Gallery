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
  description?: string;
  /** Portable Text — editorial introduction shown in the collection sidebar */
  introduction?: PortableTextBlock[];
  photos?: Photo[];
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
