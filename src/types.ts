// ─── Shared TypeScript interfaces ───

export interface Collection {
  _id: string;
  name: string;
  slug: string;
  subtitle?: string;
  coverImageUrl: string;
  location?: string;
  year?: number;
  description?: string;
  introduction?: string;
  liveProjectUrl?: string;
  photos?: Photo[];
  gridSize: 'large' | 'medium' | 'small';
  photoCount?: number;
}

export interface Photo {
  _id: string;
  title: string;
  imageUrl: string;
  camera?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: string;
  collection?: {
    name: string;
    slug: string;
  };
  styleCategory?: string;
  location?: {
    lat: number;
    lng: number;
    city?: string;
    country?: string;
  };
}
