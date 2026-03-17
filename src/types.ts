// ─── Shared TypeScript interfaces for the entire app ───

export interface Collection {
  _id: string;
  name: string;
  slug: string;
  subtitle?: string;
  coverImageUrl: string;
  location?: string;
  year?: number;
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

export interface StyleGroup {
  category: string;
  label: string;
  description: string;
  photos: Photo[];
  coverImageUrl: string;
}

// 风格映射表
export const STYLE_META: Record<string, { label: string; description: string }> = {
  landscape: { label: 'Landscape', description: 'Where horizons dissolve into light' },
  portrait: { label: 'Portrait', description: 'Faces that tell unspoken stories' },
  street: { label: 'Street', description: 'The poetry of passing moments' },
  architecture: { label: 'Architecture', description: 'Geometry carved from silence' },
  abstract: { label: 'Abstract', description: 'Beyond form, into feeling' },
};
