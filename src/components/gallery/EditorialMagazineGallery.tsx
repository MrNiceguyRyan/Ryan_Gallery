/**
 * Editorial magazine × Instagram-style photo gallery.
 * Five repeating layout patterns with consistent breathing room and aspect-ratio guards.
 */

import type { ReactNode } from 'react';

/* ─── Types ─── */

export type PhotoSpan =
  | 'full'
  | 'half'
  | 'third'
  | 'portrait-large'
  | 'landscape-half';

export interface GalleryPhoto {
  src: string;
  alt?: string;
  /** Optional caption for editorial / IG-style context */
  caption?: string;
}

export interface EditorialMagazineGalleryProps {
  photos: GalleryPhoto[];
  className?: string;
  /** Called when a photo container is clicked (e.g. open lightbox) */
  onPhotoClick?: (photo: GalleryPhoto, index: number) => void;
}

/* ─── Photo — single image with locked aspect (crop-safe) ───
 * Vertical max 4:5, horizontal max 16:9; standard landscape 3:2 where specified.
 */
export function Photo({
  photo,
  span,
  index = 0,
  onClick,
  className = '',
  /** When true (typically desktop mixed-row), portrait fills grid cell instead of fixed aspect */
  fillGridCell = false,
}: {
  photo: GalleryPhoto;
  span: PhotoSpan;
  index?: number;
  onClick?: (photo: GalleryPhoto, index: number) => void;
  className?: string;
  fillGridCell?: boolean;
}) {
  const interactive = !!onClick;

  const aspectClass: Record<PhotoSpan, string> = {
    full: 'aspect-[3/2]',
    half: 'aspect-[4/3] md:aspect-[3/2]',
    third: 'aspect-square md:aspect-[4/5]',
    'portrait-large': fillGridCell
      ? 'aspect-[3/4] md:aspect-auto md:min-h-0 md:h-full'
      : 'aspect-[3/4] md:aspect-[4/5] max-h-[80vh]',
    'landscape-half': 'aspect-[3/2] md:aspect-[16/9]',
  };

  return (
    <article
      className={`group relative w-full overflow-hidden rounded-[2px] bg-[#0a0a0a]/5 ${aspectClass[span]} ${className}`}
    >
      <button
        type="button"
        disabled={!interactive}
        onClick={() => onClick?.(photo, index)}
        className={`relative block size-full text-left ${interactive ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400' : ''}`}
      >
        <img
          src={photo.src}
          alt={photo.alt ?? ''}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover transition duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]"
        />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      </button>
      {photo.caption ? (
        <p className="mt-2 max-w-prose font-serif text-[11px] font-normal leading-snug tracking-wide text-neutral-600 md:text-xs">
          {photo.caption}
        </p>
      ) : null}
    </article>
  );
}

/* ─── MixedRow — large portrait + two stacked landscapes (grid-aligned heights) ─── */
/** MixedRow: one large portrait + two stacked landscapes; grid-aligned on md+ */
export function MixedRow({
  photo1,
  photo2,
  photo3,
  i1,
  i2,
  i3,
  reverse = false,
  onPhotoClick,
}: {
  photo1: GalleryPhoto;
  photo2: GalleryPhoto;
  photo3: GalleryPhoto;
  i1: number;
  i2: number;
  i3: number;
  reverse?: boolean;
  onPhotoClick?: (photo: GalleryPhoto, index: number) => void;
}) {
  const stack = (
    <div className="flex w-full flex-col gap-4 sm:gap-6 md:gap-6 lg:gap-8">
      <Photo photo={photo2} span="landscape-half" index={i2} onClick={onPhotoClick} />
      <Photo photo={photo3} span="landscape-half" index={i3} onClick={onPhotoClick} />
    </div>
  );

  const bigPortrait = (
    <Photo
      photo={photo1}
      span="portrait-large"
      index={i1}
      onClick={onPhotoClick}
      fillGridCell
      className="min-h-0"
    />
  );

  return (
    <div className="w-full">
      <div className="flex flex-col gap-4 sm:gap-6 md:hidden">
        {!reverse ? (
          <>
            <Photo photo={photo1} span="portrait-large" index={i1} onClick={onPhotoClick} />
            {stack}
          </>
        ) : (
          <>
            {stack}
            <Photo photo={photo1} span="portrait-large" index={i1} onClick={onPhotoClick} />
          </>
        )}
      </div>

      {!reverse ? (
        <div className="hidden md:grid md:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] md:grid-rows-2 md:gap-6 lg:gap-8">
          <div className="relative min-h-0 md:row-span-2 md:col-start-1">{bigPortrait}</div>
          <Photo
            photo={photo2}
            span="landscape-half"
            index={i2}
            onClick={onPhotoClick}
            className="md:col-start-2 md:row-start-1"
          />
          <Photo
            photo={photo3}
            span="landscape-half"
            index={i3}
            onClick={onPhotoClick}
            className="md:col-start-2 md:row-start-2"
          />
        </div>
      ) : (
        <div className="hidden md:grid md:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] md:grid-rows-2 md:gap-6 lg:gap-8">
          <Photo
            photo={photo2}
            span="landscape-half"
            index={i2}
            onClick={onPhotoClick}
            className="md:col-start-1 md:row-start-1"
          />
          <Photo
            photo={photo3}
            span="landscape-half"
            index={i3}
            onClick={onPhotoClick}
            className="md:col-start-1 md:row-start-2"
          />
          <div className="relative min-h-0 md:col-start-2 md:row-span-2 md:row-start-1">
            {bigPortrait}
          </div>
        </div>
      )}
    </div>
  );
}

function HalvesBlock({
  a,
  b,
  ia,
  ib,
  onPhotoClick,
}: {
  a: GalleryPhoto;
  b: GalleryPhoto;
  ia: number;
  ib: number;
  onPhotoClick?: (photo: GalleryPhoto, index: number) => void;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 md:gap-6 lg:gap-8">
      <Photo photo={a} span="half" index={ia} onClick={onPhotoClick} />
      <Photo photo={b} span="half" index={ib} onClick={onPhotoClick} />
    </div>
  );
}

function ThirdsBlock({
  a,
  b,
  c,
  ia,
  ib,
  ic,
  onPhotoClick,
}: {
  a: GalleryPhoto;
  b: GalleryPhoto;
  c: GalleryPhoto;
  ia: number;
  ib: number;
  ic: number;
  onPhotoClick?: (photo: GalleryPhoto, index: number) => void;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6 md:gap-6 lg:gap-8">
      <Photo photo={a} span="third" index={ia} onClick={onPhotoClick} />
      <Photo photo={b} span="third" index={ib} onClick={onPhotoClick} />
      <Photo photo={c} span="third" index={ic} onClick={onPhotoClick} />
    </div>
  );
}

function FullBlock({
  photo,
  i,
  onPhotoClick,
}: {
  photo: GalleryPhoto;
  i: number;
  onPhotoClick?: (photo: GalleryPhoto, index: number) => void;
}) {
  return (
    <div className="w-full">
      <Photo photo={photo} span="full" index={i} onClick={onPhotoClick} />
    </div>
  );
}

/**
 * Build blocks: pattern cycles with patternIndex = blocks.length % 5.
 * When a pattern can't be filled, degrades gracefully (halves / single full).
 */
function buildBlocks(
  photos: GalleryPhoto[],
  onPhotoClick?: (photo: GalleryPhoto, index: number) => void,
): ReactNode[] {
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < photos.length) {
    const pattern = blocks.length % 5;
    const remaining = photos.length - i;

    if (pattern === 0) {
      blocks.push(
        <FullBlock key={`full-${i}`} photo={photos[i]} i={i} onPhotoClick={onPhotoClick} />,
      );
      i += 1;
      continue;
    }

    if (pattern === 1) {
      if (remaining >= 3) {
        blocks.push(
          <MixedRow
            key={`mixL-${i}`}
            photo1={photos[i]}
            photo2={photos[i + 1]}
            photo3={photos[i + 2]}
            i1={i}
            i2={i + 1}
            i3={i + 2}
            reverse={false}
            onPhotoClick={onPhotoClick}
          />,
        );
        i += 3;
      } else if (remaining === 2) {
        blocks.push(
          <HalvesBlock
            key={`fallback-halves-${i}`}
            a={photos[i]}
            b={photos[i + 1]}
            ia={i}
            ib={i + 1}
            onPhotoClick={onPhotoClick}
          />,
        );
        i += 2;
      } else {
        blocks.push(
          <FullBlock key={`fallback-full-${i}`} photo={photos[i]} i={i} onPhotoClick={onPhotoClick} />,
        );
        i += 1;
      }
      continue;
    }

    if (pattern === 2) {
      if (remaining >= 2) {
        blocks.push(
          <HalvesBlock
            key={`halves-${i}`}
            a={photos[i]}
            b={photos[i + 1]}
            ia={i}
            ib={i + 1}
            onPhotoClick={onPhotoClick}
          />,
        );
        i += 2;
      } else {
        blocks.push(
          <FullBlock key={`fallback-full-${i}`} photo={photos[i]} i={i} onPhotoClick={onPhotoClick} />,
        );
        i += 1;
      }
      continue;
    }

    if (pattern === 3) {
      if (remaining >= 3) {
        blocks.push(
          <MixedRow
            key={`mixR-${i}`}
            photo1={photos[i]}
            photo2={photos[i + 1]}
            photo3={photos[i + 2]}
            i1={i}
            i2={i + 1}
            i3={i + 2}
            reverse
            onPhotoClick={onPhotoClick}
          />,
        );
        i += 3;
      } else if (remaining === 2) {
        blocks.push(
          <HalvesBlock
            key={`fallback-halves-${i}`}
            a={photos[i]}
            b={photos[i + 1]}
            ia={i}
            ib={i + 1}
            onPhotoClick={onPhotoClick}
          />,
        );
        i += 2;
      } else {
        blocks.push(
          <FullBlock key={`fallback-full-${i}`} photo={photos[i]} i={i} onPhotoClick={onPhotoClick} />,
        );
        i += 1;
      }
      continue;
    }

    /* pattern === 4 */
    if (remaining >= 3) {
      blocks.push(
        <ThirdsBlock
          key={`thirds-${i}`}
          a={photos[i]}
          b={photos[i + 1]}
          c={photos[i + 2]}
          ia={i}
          ib={i + 1}
          ic={i + 2}
          onPhotoClick={onPhotoClick}
        />,
      );
      i += 3;
    } else if (remaining === 2) {
      blocks.push(
        <HalvesBlock
          key={`fallback-halves-${i}`}
          a={photos[i]}
          b={photos[i + 1]}
          ia={i}
          ib={i + 1}
          onPhotoClick={onPhotoClick}
        />,
      );
      i += 2;
    } else {
      blocks.push(
        <FullBlock key={`fallback-full-${i}`} photo={photos[i]} i={i} onPhotoClick={onPhotoClick} />,
      );
      i += 1;
    }
  }

  return blocks;
}

/** High-level gallery: drives the five-pattern symphony */
export default function EditorialMagazineGallery({
  photos,
  className = '',
  onPhotoClick,
}: EditorialMagazineGalleryProps) {
  const visiblePhotos = photos.filter((p) => p.src?.trim());
  const blocks = buildBlocks(visiblePhotos, onPhotoClick);

  if (blocks.length === 0) {
    return (
      <p className="font-serif text-sm text-neutral-500">
        No photos to display.
      </p>
    );
  }

  return (
    <div className={`flex w-full flex-col space-y-4 sm:space-y-6 md:space-y-8 ${className}`}>
      {blocks}
    </div>
  );
}
