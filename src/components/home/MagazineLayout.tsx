import React, { createContext, useCallback, useContext, useRef, useState, useEffect, useMemo, type ReactNode } from 'react';
import { motion, useScroll, useMotionValueEvent, AnimatePresence, useReducedMotion, useIsPresent, type MotionValue } from 'framer-motion';
import { ArrowRight, Share2, Check } from 'lucide-react';
import type { Collection, Photo } from '../../types';
import Lightbox, { type LightboxOrigin, type LightboxTarget } from '../shared/Lightbox';
import {
  EDITORIAL_FALLBACKS,
  photoAccessibleLabel,
  photoDescription,
  renderPortableText,
  renderFallback,
} from '../../lib/narratives';
import { useHoverCapable } from '../../lib/useHoverCapable';
import { useInViewOnce } from '../../lib/useInViewOnce';
import Magnetic from '../shared/Magnetic';

const expo = [0.16, 1, 0.3, 1] as const;
// Heavy in-out curve for the overlay panel slide — deliberate one-off (a big
// plane of UI entering/leaving reads better with symmetric weight than expo).
const overlayEase = [0.32, 0, 0.07, 1] as const;
/** True once this row's frames should arrive (see EditorialRowFrames). */
const RowRevealContext = createContext(true);
// The developing-print reveal (after Adovasio's .appear-mask).
const developEase = [0.455, 0.03, 0.515, 0.955] as const;
const DEVELOP_MASK = 'linear-gradient(115deg, #000 40%, transparent 60%)';
const DEVELOP_MASK_STYLE = {
  WebkitMaskImage: DEVELOP_MASK,
  maskImage: DEVELOP_MASK,
  WebkitMaskSize: '300% 100%',
  maskSize: '300% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
} as const;
// Back-out curve for the photographs arriving as a story opens — the second
// sanctioned exception to house expo, approved by the owner so each page
// "springs out" instead of sliding in. The 1.56 overshoots and settles, so the
// frames lift just past rest and land. It drives transform only: opacity keeps
// expo, because an overshooting opacity has nothing to overshoot into.
const popEase = [0.34, 1.56, 0.64, 1] as const;
// The card grows into the cover. Long enough to read as one object arriving,
// short enough that expand + hold + peel stays inside a a single page turn.
const COVER_EXPAND_MS = 500;
const SHARED_OPEN_DURATION = 0.78;
const SHARED_CLOSE_DURATION = 0.62;
const SHARED_CONTENT_DELAY = SHARED_OPEN_DURATION * 0.55;

export type MagazineEntryMode = 'cover' | 'shared-photo';

export interface MagazineLayoutProps {
  collection: Collection;
  allCollections: Collection[];
  onSelectCollection: (c: Collection) => void;
  onClose: () => void;
  returnFocusElement?: HTMLElement | null;
  mainId?: string;
  standalone?: boolean;
  canonicalUrl?: string;
  /** Homepage-only handoff. The opening photograph and its source must share
   *  this layoutId; other entry points keep the existing editorial cover. */
  entryMode?: MagazineEntryMode;
  sharedLayoutId?: string;
  /** Override source detection when the matching Homepage photograph is
   *  intentionally kept mounted without being the return-focus element. */
  sharedSourcePresent?: boolean;
  /** Exact decoded URL currently visible in the Homepage source frame. Using
   *  it for the morph avoids a cache miss or a hover-frame swap on click. */
  sharedImageUrl?: string;
  /** Called after the shared photograph has completed its 780ms handoff. The
   *  parent owns keyboard/focus orchestration in shared-photo mode. */
  onEntryReady?: (focusTarget: HTMLButtonElement | null) => void;
}

/** Optional per-collection background for the story cover transition.
 *  Mapped archive textures take priority; other stories reuse existing
 *  collection imagery beneath the same quiet grade rather than going blank. */
const COVER_BG: Record<string, string> = {
  miami: '/textures/optimized/miami-map-2000.webp',
  'new-york-stories': '/textures/optimized/new-york-map-2000.webp',
  orlando: '/textures/optimized/orlando-map-2000.webp',
};

type IndexedPhoto = { photo: Photo; index: number };
type EditorialRow = {
  layout: 'wide' | 'pair' | 'trio' | 'portrait-solo';
  items: IndexedPhoto[];
};

const isPortrait = (photo: Photo) =>
  photo.width != null && photo.height != null && photo.height > photo.width;

/** Length of the run of consecutive portraits starting at `from`. */
function portraitRunLength(entries: IndexedPhoto[], from: number): number {
  let end = from;
  while (end < entries.length && isPortrait(entries[end].photo)) end += 1;
  return end - from;
}

/**
 * A run of three or more portraits alternates a three-up row with a single
 * portrait given the width. Pairing them two by two turned Orlando — one
 * landscape and sixteen portraits — into eight identical side-by-side rows in
 * a row; this changes the rhythm on every row and never lays two portraits
 * side by side unless exactly two are left over.
 */
function pushPortraitRun(rows: EditorialRow[], run: IndexedPhoto[]) {
  let index = 0;
  let wantTrio = rows[rows.length - 1]?.layout !== 'trio';
  while (index < run.length) {
    const left = run.length - index;
    if (wantTrio && left >= 3) {
      rows.push({ layout: 'trio', items: run.slice(index, index + 3) });
      index += 3;
    } else if (wantTrio && left === 2) {
      rows.push({ layout: 'pair', items: run.slice(index, index + 2) });
      index += 2;
    } else if (wantTrio && left === 1) {
      // A lone leftover after a single portrait joins it rather than stacking
      // two single-portrait rows back to back.
      const previous = rows[rows.length - 1];
      if (previous?.layout === 'portrait-solo') {
        rows[rows.length - 1] = { layout: 'pair', items: [...previous.items, run[index]] };
      } else {
        rows.push({ layout: 'portrait-solo', items: [run[index]] });
      }
      index += 1;
    } else {
      rows.push({ layout: 'portrait-solo', items: [run[index]] });
      index += 1;
    }
    wantTrio = !wantTrio;
  }
}

/**
 * A small orientation-aware editorial grammar. Landscapes may breathe at full
 * width; a portrait or two sits beside its neighbours; longer runs of
 * portraits alternate three-up rows with a single portrait (see
 * `pushPortraitRun`). A one-photo portrait archive gets a restrained centered
 * column rather than a viewport-filling treatment.
 */
function buildEditorialRows(photos: Photo[]): EditorialRow[] {
  const entries = photos.map((photo, index) => ({ photo, index }));
  const rows: EditorialRow[] = [];
  let cursor = 0;

  if (entries[0]) {
    const openingRun = portraitRunLength(entries, 0);
    if (openingRun >= 3) {
      pushPortraitRun(rows, entries.slice(0, openingRun));
      cursor = openingRun;
    } else if (isPortrait(entries[0].photo)) {
      if (entries[1]) {
        rows.push({ layout: 'pair', items: entries.slice(0, 2) });
        cursor = 2;
      } else {
        rows.push({ layout: 'portrait-solo', items: [entries[0]] });
        cursor = 1;
      }
    } else {
      rows.push({ layout: 'wide', items: [entries[0]] });
      cursor = 1;
    }
  }

  while (cursor < entries.length) {
    const current = entries[cursor];
    const next = entries[cursor + 1];

    if (isPortrait(current.photo)) {
      const run = portraitRunLength(entries, cursor);
      if (run >= 3) {
        pushPortraitRun(rows, entries.slice(cursor, cursor + run));
        cursor += run;
        continue;
      }
      if (next) {
        rows.push({ layout: 'pair', items: [current, next] });
        cursor += 2;
        continue;
      }

      const previous = rows[rows.length - 1];
      if (previous?.layout === 'wide') {
        rows[rows.length - 1] = { layout: 'pair', items: [...previous.items, current] };
      } else if (previous?.layout === 'pair') {
        rows[rows.length - 1] = { layout: 'trio', items: [...previous.items, current] };
      } else {
        rows.push({ layout: 'portrait-solo', items: [current] });
      }
      cursor += 1;
      continue;
    }

    if (next && isPortrait(next.photo)) {
      rows.push({ layout: 'pair', items: [current, next] });
      cursor += 2;
      continue;
    }

    // Alternate a full landscape with a paired landscape spread. The rhythm
    // responds to actual orientation instead of restarting every seven frames.
    if (next && rows[rows.length - 1]?.layout === 'wide') {
      rows.push({ layout: 'pair', items: [current, next] });
      cursor += 2;
      continue;
    }

    rows.push({ layout: 'wide', items: [current] });
    cursor += 1;
  }

  return rows;
}

function labelsMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const normalize = (value: string) => value
    .toLocaleLowerCase()
    .replace(/\b(national park|stories|city)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  const left = normalize(a);
  const right = normalize(b);
  const rightPrimary = normalize(b.split(',')[0]);
  return !!left && (left === right || left === rightPrimary);
}

/* ── Photo cell — editorial grid item, original aspect ratio, no cropping ── */
/** One editorial row. It reports ready when the cover has left (the leading
 *  rows) or when the reader reaches it, and its frames arrive off that one
 *  trigger — one observer per row rather than one per photograph. */
function EditorialRowFrames({ children, spaced, leading, revealReady }: {
  children: ReactNode;
  spaced: boolean;
  leading: boolean;
  revealReady: boolean;
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>('0px 0px -12% 0px', 0.08);
  return (
    <div
      ref={ref}
      className={`grid grid-cols-6 gap-x-2 gap-y-8 md:gap-x-3 md:gap-y-10 items-end ${spaced ? 'pt-12 md:pt-16' : ''}`}
    >
      <RowRevealContext.Provider value={revealReady && (leading || inView)}>
        {children}
      </RowRevealContext.Provider>
    </div>
  );
}

function PhotoCell({
  photo,
  span,
  index,
  hoveredIndex,
  setHoveredIndex,
  onClick,
  canHover,
  revealReady,
  posInRow,
  develops,
  hideOnMobile = false,
  collectionName,
  total,
  frameNumber,
}: {
  photo: Photo;
  span: 'full' | 'half' | 'third' | 'portrait';
  index: number;
  hoveredIndex: number | null;
  setHoveredIndex: (idx: number | null) => void;
  /** Called with the frame's own element, so the viewer can open out of it. */
  onClick: (element: HTMLElement | null) => void;
  /** When false (touch device), skip hover-driven dim/blur — there's
   *  no way for the user to trigger or escape it cleanly. */
  canHover: boolean;
  revealReady: boolean;
  /** Position of this frame within its row: the row arrives as one unit and
   *  its frames follow left to right. */
  posInRow: number;
  /** A plate big enough to read a diagonal edge crossing it. */
  develops: boolean;
  hideOnMobile?: boolean;
  collectionName: string;
  total: number;
  /** 1-based position within this chapter. Numbered per chapter rather than
   *  across the archive: the homepage shows chapters grouped by region while
   *  `allCollections` arrives in data order, so an archive-wide count would
   *  give the same photograph a different number on each surface. */
  frameNumber: number;
}) {
  const colSpan =
    span === 'full' ? 'col-span-6'
    : span === 'half' ? 'col-span-3'
    : span === 'portrait' ? 'col-span-4 col-start-2'
    : 'col-span-6 sm:col-span-2';

  // Width brackets per span — Retina-aware. The browser picks based on `sizes`.
  const widthLadder =
    span === 'full' ? [900, 1400, 1800] :
    span === 'half' || span === 'portrait' ? [500, 800, 1200] :
                      [300, 500, 800];
  const fallbackWidth = widthLadder[1];
  const srcSet = widthLadder
    .map((w) => `${photo.imageUrl}?auto=format&w=${w}&q=82 ${w}w`)
    .join(', ');
  const sizesAttr =
    span === 'full' ? '(min-width: 1024px) 60vw, 100vw' :
    span === 'half' || span === 'portrait' ? '(min-width: 1024px) 30vw, 66vw' :
                      '(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 100vw';

  const reduce = useReducedMotion();
  const imageRef = useRef<HTMLImageElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    const image = imageRef.current;
    setIsLoaded(!!image?.complete && image.naturalWidth > 0);
    setHasError(!!image?.complete && image.naturalWidth === 0);
  }, [photo.imageUrl]);
  // Caption: "Frame 01 · <title of the work>". Place and year are not
  // repeated per frame — the chapter header already states them once. The
  // title is the Sanity title only when it is a real one; every current title
  // is machine-made ("Miami #24"), so until titles are written the caption is
  // the frame number alone rather than a filename.
  const frameLabel = `Frame ${String(frameNumber).padStart(2, '0')}`;
  const workTitle = photoDescription(photo);
  // What is shown is what is announced — plus the place, which the visible
  // caption leaves to the chapter header but a screen-reader user landing on
  // one frame would otherwise not hear.
  const place = photo.location?.city?.trim() || collectionName;
  const accessibleLabel = [frameLabel, workTitle, place].filter(Boolean).join(', ');
  // On touch devices we treat the grid as if no one is hovered: every
  // photo stays at full clarity, no blur/scale-down ever fires. We also
  // skip the hover handlers entirely so a tap → onHoverStart → flash of
  // dim doesn't happen before the lightbox opens.
  const interactiveHover = canHover && !reduce;
  const isAnyHovered = interactiveHover && hoveredIndex !== null;
  const isThisHovered = interactiveHover && hoveredIndex === index;
  // Every frame arrives; the first seven wait for the cover to leave, the
  // rest for the reader to reach their row.
  const rowReady = useContext(RowRevealContext);
  const animateEntrance = !reduce;

  const arrived = revealReady && rowReady;
  // The first seven are the cover hand-off and stagger across the page; after
  // that a row arrives as a unit and its frames follow in place.
  const entranceDelay = arrived ? (index < 7 ? index * 0.06 : posInRow * 0.07) : 0;
  const developSpan = index < 7 ? 0.8 : 0.62;

  return (
    // The figure owns the grid placement only. The photograph and its caption
    // are two different kinds of thing and no longer arrive as one: the picture
    // develops, and the caption is printed under it a beat later. The button
    // wraps only the image — a caption inside the control would be read as part
    // of its name and would make the whole caption a click target.
    <figure className={`${colSpan} ${hideOnMobile ? 'hidden lg:block' : 'block'} m-0`}>
    <motion.div
      // The photograph develops: a soft diagonal edge sweeps across it (the
      // mask is three times the frame's width, so the edge crosses at an even
      // pace), with a small rise. Reduced motion: no mask, no motion. The mask
      // stops at the photograph — it used to cover the whole figure, so the
      // caption came up through the developer with the picture, as though a
      // line of metadata were part of the print.
      style={animateEntrance && develops ? DEVELOP_MASK_STYLE : undefined}
      initial={animateEntrance
        ? (develops ? { opacity: 0, y: 14, WebkitMaskPosition: '100% 0%', maskPosition: '100% 0%' } : { opacity: 0, y: 10 })
        : false}
      animate={animateEntrance && !arrived
        ? (develops ? { opacity: 0, y: 14, WebkitMaskPosition: '100% 0%', maskPosition: '100% 0%' } : { opacity: 0, y: 10 })
        : (develops ? { opacity: 1, y: 0, WebkitMaskPosition: '0% 0%', maskPosition: '0% 0%' } : { opacity: 1, y: 0 })}
      transition={(() => {
        if (!animateEntrance) return { duration: 0 };
        return {
          opacity: { duration: 0.25, delay: entranceDelay, ease: expo },
          y: { duration: developSpan, delay: entranceDelay, ease: popEase },
          WebkitMaskPosition: { duration: developSpan, delay: entranceDelay, ease: developEase },
          maskPosition: { duration: developSpan, delay: entranceDelay, ease: developEase },
        };
      })()}
    >
    <motion.button
      type="button"
      {...(interactiveHover && {
        onHoverStart: () => setHoveredIndex(index),
        onHoverEnd: () => setHoveredIndex(null),
        onFocus: () => setHoveredIndex(index),
        onBlur: () => setHoveredIndex(null),
        whileTap: { scale: 0.996 },
      })}
      {...(!interactiveHover && !reduce && {
        whileTap: { opacity: 0.9 },
      })}
      onClick={(event) => onClick(event.currentTarget)}
      data-frame-index={index}
      aria-label={`Open ${accessibleLabel}`}
      animate={{
        opacity: isAnyHovered && !isThisHovered ? 0.84 : 1,
      }}
      transition={{ duration: 0.32, ease: expo }}
      className="group relative block w-full cursor-pointer overflow-hidden bg-[#30352a] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]"
    >
      {/* The opening row follows the cover's departure, not mount time.
          Images load underneath it; opacity never depends on image loading
          or an intersection observer. Keep the reveal compositor-only. */}
      <div className="relative">
        {/* Loading placeholder */}
        <motion.div
          animate={{ opacity: isLoaded || hasError ? 0 : 1 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 bg-white/5 z-10 pointer-events-none"
        />

        {hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#292e25] px-5 text-center">
            <span className="font-ui text-[9px] uppercase tracking-[0.28em] text-white/58">
              Frame unavailable
            </span>
          </div>
        )}

        {/* Image — original aspect ratio, no cropping. Inner zoom on hover
             only applies when the device actually supports hover. */}
        <motion.img
          ref={imageRef}
          onLoad={() => setIsLoaded(true)}
          onError={() => { setHasError(true); setIsLoaded(true); }}
          animate={{ scale: isThisHovered ? 1.018 : 1 }}
          transition={{ duration: reduce ? 0 : 0.7, ease: expo }}
          src={`${photo.imageUrl}?auto=format&w=${fallbackWidth}&q=82`}
          srcSet={srcSet}
          sizes={sizesAttr}
          alt={accessibleLabel}
          width={photo.width}
          height={photo.height}
          className={`w-full h-auto block transition-opacity duration-500 ${hasError ? 'opacity-0' : ''}`}
          loading={index === 0 ? 'eager' : 'lazy'}
          fetchPriority={index === 0 ? 'high' : undefined}
          decoding="async"
          draggable={false}
        />
        {/* NOTE: the image is no longer opacity-gated on `isLoaded` — the old
            opacity gate (combined with lazy loading) once left below-fold photos
            invisible inside the story's inner scroll container. With the gate
            gone, the first rows load eagerly and the rest lazy-load as the
            story scrolls — an opened 40-photo story no longer fires 40
            full-size requests up front. */}
      </div>
    </motion.button>
    {/* Set in the other family from the text, at ~0.66x of it — the one ratio
        every editorial site sampled agrees on (0.54–0.86x). No rule above or
        below the frame; the caption sits directly under the image. */}
    </motion.div>
    {/* Printed under the frame a beat after it, the way a caption is set after
        the plate it belongs to — not swept in by the same developer. */}
    <motion.figcaption
      className="mt-2.5 font-ui text-[12.5px] leading-snug text-white/62"
      initial={animateEntrance ? { opacity: 0, y: 6 } : false}
      animate={animateEntrance && !arrived ? { opacity: 0, y: 6 } : { opacity: 1, y: 0 }}
      // Keyed to the sweep rather than to a flat delay, so the line settles just
      // as the print finishes coming up — whatever length that row's develop is.
      transition={animateEntrance
        ? { duration: 0.42, delay: entranceDelay + developSpan * 0.62, ease: expo }
        : { duration: 0 }}
    >
      <span className="uppercase tracking-[0.06em] tabular-nums">{frameLabel}</span>
      {workTitle && (
        <>
          <span aria-hidden="true" className="text-white/40">&nbsp;·&nbsp;</span>
          <span>{workTitle}</span>
        </>
      )}
    </motion.figcaption>
    </figure>
  );
}

/* Reading-progress % label — holds the ONLY state driven by story scroll, so
   each scroll tick re-renders this one span instead of the whole overlay. */
function ProgressPercent({ progress }: { progress: MotionValue<number> }) {
  const [pct, setPct] = useState(0);
  useMotionValueEvent(progress, 'change', (latest) => {
    const next = Math.round(latest * 100);
    setPct((prev) => (prev === next ? prev : next));
  });
  return <span className="font-ui tabular-nums min-w-[4ch] text-right">{pct}%</span>;
}

/* ── Full-screen lightbox using existing shared component ── */
function LightboxShell({
  photos,
  activeIndex,
  onClose,
  collectionName,
  origin,
  resolveTarget,
}: {
  photos: Photo[];
  activeIndex: number;
  onClose: () => void;
  collectionName: string;
  origin: LightboxOrigin | null;
  resolveTarget: (index: number) => LightboxTarget | null;
}) {
  return (
    <Lightbox
      photos={photos}
      initialIndex={activeIndex}
      onClose={onClose}
      collectionName={collectionName}
      origin={origin}
      resolveTarget={resolveTarget}
    />
  );
}

/* ══════════════════════════════════════════════════════════
 *  MagazineLayout — dark-theme collection detail overlay
 * ══════════════════════════════════════════════════════════ */
export default function MagazineLayout({
  collection,
  allCollections,
  onSelectCollection,
  onClose,
  returnFocusElement,
  mainId,
  standalone = false,
  canonicalUrl,
  entryMode = 'cover',
  sharedLayoutId,
  sharedSourcePresent,
  sharedImageUrl,
  onEntryReady,
}: MagazineLayoutProps) {
  const reduce = useReducedMotion();
  const isPresent = useIsPresent();
  const sharedEntry = entryMode === 'shared-photo';
  // A Keep Reading selection stays inside the same Story shell. Only the
  // collection actually opened from Homepage may morph back to that source.
  const sharedEntryCollectionRef = useRef(collection._id);
  const isSharedEntryCollection = sharedEntry && collection._id === sharedEntryCollectionRef.current;
  const dialogRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onEntryReadyRef = useRef(onEntryReady);
  onEntryReadyRef.current = onEntryReady;
  const { scrollYProgress } = useScroll({ container: containerRef });
  const [isShared, setIsShared] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [shareFallbackUrl, setShareFallbackUrl] = useState('');
  const shareResetTimerRef = useRef<number | null>(null);
  const shareAttemptRef = useRef(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // The box of the frame that opened the viewer, read at click time.
  const [lightboxOrigin, setLightboxOrigin] = useState<LightboxOrigin | null>(null);
  // Where a frame IS, asked for at the moment the viewer closes rather than
  // remembered from when it opened. Two elements can carry the same index (the
  // grid cell and the phone's opening frame, one of which is display:none at
  // any width), so take the first one actually laid out.
  const resolveFrameTarget = useCallback((index: number) => {
    const root = containerRef.current;
    if (!root) return null;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(`[data-frame-index="${index}"]`));
    const node = nodes.find((candidate) => candidate.offsetParent !== null);
    if (!node) return null;
    let box = node.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    // The reader may have paged a long way from the frame they opened, and the
    // story underneath has not moved since. Bring that frame into view before
    // measuring it: the viewer still covers the whole screen, so the story
    // scrolling to meet it is never seen — and it means closing always returns
    // the reader to the frame they were actually looking at, rather than to
    // wherever they happened to start.
    const rootBox = root.getBoundingClientRect();
    if (box.top < rootBox.top + 24 || box.bottom > rootBox.bottom - 24) {
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      root.scrollTop += (box.top - rootBox.top) - (rootBox.height - box.height) / 2;
      box = node.getBoundingClientRect();
      root.style.scrollBehavior = previousBehavior;
      if (!box.width || !box.height) return null;
    }
    return { box: { x: box.x, y: box.y, width: box.width, height: box.height }, node };
  }, []);
  const openLightbox = (index: number, element: HTMLElement | null) => {
    const box = element?.getBoundingClientRect();
    setLightboxOrigin(box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null);
    setLightboxIndex(index);
  };
  const [openingFrameError, setOpeningFrameError] = useState(false);
  const [sharedBodyReady, setSharedBodyReady] = useState(!sharedEntry || !!reduce);
  // Touch devices: skip the "dim every other photo when one is hovered"
  // effect — the user can't trigger or escape it cleanly, and the hover
  // handler firing on tap causes a flash of dim before the lightbox opens.
  const canHover = useHoverCapable();
  // Editorial cover intro — a printed "front page" that holds the screen as
  // the story opens (collection name as masthead headline + column rules +
  // folio + newsprint halftone), then peels up to reveal the grid. Replays
  // whenever the collection changes (e.g. "Keep Reading" → next story).
  const [coverGone, setCoverGone] = useState(sharedEntry || !!reduce);
  const [coverExited, setCoverExited] = useState(sharedEntry || !!reduce);
  useEffect(() => {
    setOpeningFrameError(false);
    setHoveredIndex(null);
    setLightboxIndex(null);
    // The turn is over the moment this story is the current one. Cleared HERE
    // rather than when the plane finishes growing: clearing it earlier would
    // unmount the plane for the one frame before this effect re-arms the cover,
    // and that frame is the whole story swapping in plain sight. Cleared ABOVE
    // the two early returns, because under reduced motion (and on the shared
    // path) they take the cover away themselves — and a pending turn left set
    // there keeps the plane mounted over the story for good.
    setPendingStory(null);
    if (sharedEntry) { setCoverGone(true); setCoverExited(true); return; }
    if (reduce) { setCoverGone(true); setCoverExited(true); return; }
    setCoverExited(false);
    setCoverGone(false);
    // Let the headline finish writing before the cover leaves. The previous
    // 780ms cutoff sent the page upward while the title was still arriving,
    // making the two motions compete instead of reading as one handoff.
    const t = setTimeout(() => setCoverGone(true), 980);
    return () => clearTimeout(t);
  }, [collection._id, reduce, sharedEntry]);

  // Treat the story as a real modal: focus the close control on entry, keep
  // keyboard focus inside, and return focus to the card that opened it.
  useEffect(() => {
    if (standalone || sharedEntry) return;
    previousFocusRef.current = returnFocusElement?.isConnected
      ? returnFocusElement
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [returnFocusElement, sharedEntry, standalone]);

  // Both the editorial cover and the shared-photo handoff hold the story body
  // inert for their opening beat. Focus the dialog shell immediately so
  // keyboard users never sit inside the now-inert Homepage during that time.
  useEffect(() => {
    if (standalone || !isPresent) return;
    dialogRef.current?.focus({ preventScroll: true });
  }, [collection._id, sharedEntry, standalone, isPresent]);

  useEffect(() => {
    // Standalone work pages are documents, not dialogs. Do not steal focus
    // from the browser/skip-link flow when their decorative cover clears.
    if (standalone || sharedEntry || !coverExited || !isPresent) return;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [collection._id, coverExited, sharedEntry, standalone, isPresent]);

  // Open every story with a real horizontal frame. This restores the original
  // collection-story rule: promote the first landscape photograph, then keep
  // every remaining frame in its existing order. The same array drives the
  // grid, mobile opener and lightbox so their indices stay aligned.
  const photos = useMemo(() => {
    const source = collection.photos || [];
    if (source.length < 2) return source;
    const landscapeIndex = source.findIndex((photo) =>
      photo.width != null && photo.height != null && photo.width > photo.height,
    );
    if (landscapeIndex <= 0) return source;
    const ordered = [...source];
    const [landscape] = ordered.splice(landscapeIndex, 1);
    ordered.unshift(landscape);
    return ordered;
  }, [collection.photos]);
  const editorialRows = useMemo(() => buildEditorialRows(photos), [photos]);
  // The chapter's end-cap plays when the reader arrives at it.
  const [endCapRef, endCapShown] = useInViewOnce<HTMLButtonElement>('0px 0px -18% 0px', 0.2);
  const distinctLocation = typeof collection.location === 'string' && !labelsMatch(collection.name, collection.location)
    ? collection.location.trim()
    : '';
  const sharedPhotoBase = collection.coverImageUrl || photos[0]?.imageUrl || '';
  const sharedPhotoUrl = sharedImageUrl || (sharedPhotoBase
    ? `${sharedPhotoBase}${sharedPhotoBase.includes('?') ? '&' : '?'}auto=format&w=2200&q=86`
    : '');
  const hasSharedSource = sharedSourcePresent ?? !!returnFocusElement?.isConnected;
  const canMorphSharedPhoto = isSharedEntryCollection && !!sharedLayoutId && !!sharedPhotoUrl && hasSharedSource;

  // ── The page turn ──
  // "Keep Reading" used to swap the collection in the same frame the reader
  // clicked: the next story's full-screen cover simply existed, whole, while an
  // effect scrolled the page back to the top underneath it — the cut hidden by
  // the thing doing the cutting. Now the card the reader clicked BECOMES the
  // cover: its box is measured once, at click, and the plane grows out of it.
  // The story underneath is swapped only once that plane is opaque and
  // full-screen, so the swap is never seen, and the cover's own choreography
  // holds until it has landed rather than playing while it travels.
  const [pendingStory, setPendingStory] = useState<{ collection: Collection; box: LightboxOrigin } | null>(null);
  const onSelectCollectionRef = useRef(onSelectCollection);
  onSelectCollectionRef.current = onSelectCollection;
  // The cover announces the story it is opening, which during the turn is not
  // yet the story this component is rendering.
  const coverStory = pendingStory?.collection ?? collection;
  const coverArrived = !pendingStory;
  const coverIndex = allCollections.findIndex((entry) => entry._id === coverStory._id);
  const coverFolio = String((coverIndex >= 0 ? coverIndex : 0) + 1).padStart(2, '0');
  const coverFrameCount = pendingStory
    ? (pendingStory.collection.photos?.length ?? pendingStory.collection.photoCount ?? 0)
    : photos.length;
  const coverLocation = typeof coverStory.location === 'string' && !labelsMatch(coverStory.name, coverStory.location)
    ? coverStory.location.trim()
    : '';
  const coverBackdropBase = (coverStory.slug && COVER_BG[coverStory.slug])
    || coverStory.coverImageUrl
    || (pendingStory ? '' : photos[0]?.imageUrl)
    || '';
  const coverBackdrop = coverBackdropBase.includes('cdn.sanity.io/images/')
    ? `${coverBackdropBase.split('?')[0]}?auto=format&w=2000&q=78`
    : coverBackdropBase;
  const beginPageTurn = (next: Collection, card: HTMLElement | null) => {
    if (pendingStory) return;
    const box = card?.getBoundingClientRect();
    // Focus the shell before the story body goes inert underneath the plane.
    dialogRef.current?.focus({ preventScroll: true });
    if (!box || !box.width || !box.height) {
      onSelectCollection(next);
      return;
    }
    setPendingStory({ collection: next, box: { x: box.x, y: box.y, width: box.width, height: box.height } });
  };
  // The swap is on a timer rather than on the plane's own animation callback:
  // under reduced motion the plane arrives in zero seconds, and a page turn
  // that depends on a callback firing for a zero-length animation is a page
  // turn that can simply not happen.
  useEffect(() => {
    if (!pendingStory) return;
    const timer = window.setTimeout(
      () => onSelectCollectionRef.current(pendingStory.collection),
      reduce ? 0 : COVER_EXPAND_MS,
    );
    return () => window.clearTimeout(timer);
  }, [pendingStory, reduce]);

  // The photograph owns the first 55% of the Homepage handoff. Navigation and
  // story content become interactive only once that expansion has established
  // the new full-screen context. With no matching source we skip the hold and
  // use a short, quiet fade instead of manufacturing another cover.
  useEffect(() => {
    if (!sharedEntry || !isPresent) return;
    if (!isSharedEntryCollection) {
      setSharedBodyReady(true);
      return;
    }

    if (reduce) {
      setSharedBodyReady(true);
      const frame = requestAnimationFrame(() => onEntryReadyRef.current?.(closeButtonRef.current));
      return () => cancelAnimationFrame(frame);
    }

    setSharedBodyReady(!canMorphSharedPhoto);
    const bodyTimer = canMorphSharedPhoto
      ? window.setTimeout(() => setSharedBodyReady(true), SHARED_CONTENT_DELAY * 1000)
      : 0;
    const readyTimer = window.setTimeout(
      () => onEntryReadyRef.current?.(closeButtonRef.current),
      (canMorphSharedPhoto ? SHARED_OPEN_DURATION : 0.35) * 1000,
    );
    return () => {
      if (bodyTimer) window.clearTimeout(bodyTimer);
      window.clearTimeout(readyTimer);
    };
  }, [canMorphSharedPhoto, isPresent, isSharedEntryCollection, reduce, sharedEntry]);

  // Reset internal scroll position whenever the user switches to a new
  // collection (e.g. clicks "Keep Reading"). Without this the next story
  // opens at the bottom — wherever the user clicked from.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'auto' });
  }, [collection._id]);

  // Next story
  const currentIndex = allCollections.findIndex((c) => c._id === collection._id);
  const nextCollection = allCollections[(currentIndex + 1) % allCollections.length];
  // Folio / dispatch number for the editorial cover (1-based, zero-padded)
  const folio = String((currentIndex >= 0 ? currentIndex : 0) + 1).padStart(2, '0');


  useEffect(() => {
    setIsShared(false);
    setShareStatus('');
    setShareFallbackUrl('');
    return () => {
      shareAttemptRef.current += 1;
      if (shareResetTimerRef.current !== null) window.clearTimeout(shareResetTimerRef.current);
    };
  }, [collection._id]);

  const handleShare = async () => {
    const attempt = ++shareAttemptRef.current;
    if (shareResetTimerRef.current !== null) window.clearTimeout(shareResetTimerRef.current);
    setIsShared(false);
    setShareStatus('');
    setShareFallbackUrl('');
    const storyUrl = canonicalUrl
      ? new URL(canonicalUrl, window.location.origin).href
      : collection.slug
        ? new URL(`/works/${collection.slug}`, window.location.origin).href
        : window.location.href;
    const shareData = {
      title: `Ryan Xu | ${collection.name}`,
      text: collection.description || '',
      url: storyUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        if (attempt === shareAttemptRef.current) setShareStatus('Story shared.');
        return;
      } catch (error) {
        // Dismissing the native share sheet is an intentional cancellation.
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    if (attempt !== shareAttemptRef.current) return;
    try {
      await navigator.clipboard.writeText(storyUrl);
      if (attempt !== shareAttemptRef.current) return;
      setIsShared(true);
      setShareStatus('Link copied to clipboard.');
      shareResetTimerRef.current = window.setTimeout(() => {
        setIsShared(false);
        setShareStatus('');
        shareResetTimerRef.current = null;
      }, 2000);
    } catch {
      if (attempt !== shareAttemptRef.current) return;
      setShareFallbackUrl(storyUrl);
      setShareStatus('Unable to copy automatically. Select the link below to copy it.');
    }
  };

  const backToStoryTop = () => {
    closeButtonRef.current?.focus({ preventScroll: true });
    containerRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  // Escape closes the story (unless the lightbox is open — it owns Escape then).
  useEffect(() => {
    // Homepage owns Escape, focus trapping and source restoration while a
    // shared photograph is moving between the two surfaces.
    // The outgoing shell stays mounted for its visual exit, but must not
    // trap focus or accept another Story action once that exit has begun.
    if (sharedEntry || !isPresent) return;
    const fn = (e: KeyboardEvent) => {
      if (e.defaultPrevented || lightboxIndex !== null) return;
      // Escape closes only the Homepage modal. On a standalone /works page it
      // must not unexpectedly navigate away from a normal document.
      if (standalone) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('aria-hidden') && element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose, lightboxIndex, sharedEntry, standalone, isPresent]);

  const StoryShell = standalone ? motion.main : motion.div;
  const StoryHeading = standalone ? 'h1' : 'h2';
  const sharedPanelDelay = canMorphSharedPhoto ? SHARED_CONTENT_DELAY : 0;
  const photoRevealReady = !!reduce || (sharedEntry ? sharedBodyReady : coverGone);

  return (
    <>
      {/* Overlay shell — slide-up/down. (No backdrop-blur: the panel covers the
          backdrop within a second, so the blur cost never reads.) */}
      <StoryShell
        ref={dialogRef}
        id={standalone ? mainId : undefined}
        tabIndex={-1}
        // A standalone /works page is server-rendered, and framer writes
        // `initial` into the SSR style attribute — so this shell shipped its
        // whole front page at `opacity: 0`. With /travel → /works getting no
        // `data-axis` (the root view-transition rule is `animation: none`) the
        // visitor got a hard cut to a blank screen that lasted until hydration,
        // then a 700ms fade. The document must paint what it was sent.
        initial={standalone || (sharedEntry && canMorphSharedPhoto) ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: sharedEntry && canMorphSharedPhoto ? 1 : 0 }}
        transition={{
          duration: reduce
            ? 0
            : sharedEntry
              ? isPresent
                ? canMorphSharedPhoto ? 0 : 0.35
                : SHARED_CLOSE_DURATION
              : 0.7,
          ease: expo,
        }}
        className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden ${sharedEntry ? 'bg-transparent' : 'bg-black/40'}`}
        role={standalone ? undefined : 'dialog'}
        aria-modal={standalone ? undefined : true}
        aria-label={`Story: ${collection.name}`}
        inert={!isPresent}
        aria-hidden={lightboxIndex !== null || !isPresent}
      >
        {sharedEntry && (
          <motion.div
            aria-hidden="true"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: reduce
                ? 0
                : isPresent
                  ? SHARED_OPEN_DURATION * 0.4
                  : SHARED_CLOSE_DURATION * 0.4,
              delay: reduce || isPresent ? 0 : SHARED_CLOSE_DURATION * 0.6,
              ease: expo,
            }}
            className="pointer-events-none absolute inset-0 z-0 bg-[#171b15]"
          />
        )}
        {canMorphSharedPhoto && (
          <motion.div
            layout
            layoutId={sharedLayoutId}
            aria-hidden="true"
            initial={false}
            animate={{ opacity: 1, borderRadius: 0 }}
            exit={{ opacity: 1, borderRadius: 0 }}
            transition={{
              layout: {
                duration: reduce ? 0 : isPresent ? SHARED_OPEN_DURATION : SHARED_CLOSE_DURATION,
                ease: expo,
              },
              borderRadius: { duration: reduce ? 0 : isPresent ? SHARED_OPEN_DURATION : SHARED_CLOSE_DURATION, ease: expo },
            }}
            className="pointer-events-none absolute inset-0 z-[1] overflow-hidden bg-[#20241a]"
          >
            <img
              src={sharedPhotoUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              draggable={false}
            />
          </motion.div>
        )}

        <motion.div
          id={standalone ? undefined : mainId}
          tabIndex={!standalone && mainId ? -1 : undefined}
          inert={sharedEntry ? !sharedBodyReady : !coverExited}
          initial={sharedEntry ? { opacity: 0 } : reduce ? { opacity: 0 } : { y: '100%' }}
          animate={sharedEntry ? { opacity: 1 } : reduce ? { opacity: 1 } : { y: 0 }}
          exit={sharedEntry ? { opacity: 0 } : reduce ? { opacity: 0 } : { y: '100%' }}
          transition={sharedEntry
            ? {
                duration: reduce ? 0 : isPresent ? 0.35 : 0.22,
                delay: reduce || !isPresent ? 0 : sharedPanelDelay,
                ease: expo,
              }
            : { duration: reduce ? 0 : 0.68, ease: overlayEase }}
          ref={containerRef}
          data-lenis-prevent
          className="z-10 w-full h-[100dvh] overflow-y-auto overscroll-contain no-scrollbar relative bg-[#30352a] text-[#F4F4ED] focus:outline-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Sticky header — top padding honors iOS notch safe-area */}
          <div
              className="safe-inline-story-header sticky top-0 left-0 w-full z-[90] isolate py-4 md:py-6 flex justify-between items-center bg-[#20241a]/92 border-b border-white/[0.055] shadow-[0_10px_28px_rgba(8,10,7,0.12)]"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
          >
            <motion.button
              ref={closeButtonRef}
              onClick={onClose}
              whileHover={reduce ? undefined : { x: -2 }}
              whileTap={reduce ? undefined : { scale: 0.96, x: -4 }}
              transition={{ duration: 0.2, ease: expo }}
              className="flex min-h-11 items-center gap-3 -ml-1 pl-1 pr-2 text-[10px] uppercase tracking-[0.1em] font-bold hover:opacity-60 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]"
              aria-label={`${standalone ? 'Back from' : 'Close'} ${collection.name} story`}
            >
              <ArrowRight size={16} className="rotate-180" /> Back
            </motion.button>
            <div className="text-[10px] md:text-[11px] uppercase tracking-[0.1em] md:tracking-[0.1em] font-bold opacity-[0.58] truncate max-w-[55vw] md:max-w-none">
              {collection.name}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-white/[0.04] lg:hidden" aria-hidden="true">
              <motion.div
                className="h-full origin-left bg-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]"
                style={{ scaleX: scrollYProgress }}
              />
            </div>
          </div>

          {/* Content */}
          <div className="safe-inline-story-content relative z-0">
            <div className="mx-auto max-w-6xl py-12 md:py-16 relative">
              <div className="grid lg:grid-cols-12 gap-8 md:gap-12 relative z-10">
                {/* ── Sidebar — fixed to viewport on desktop, three vertical regions:
                       TOP: compact header (Vol/name/meta) — never scrolls
                       MIDDLE: editorial introduction — scrolls internally if long
                       BOTTOM: scroll progress + frame count + mini-map — always pinned

                       Total height computed from the sticky offset (top-24 = 6rem)
                       and the sticky header (h-16 ≈ 4rem) plus breathing room,
                       so the whole sidebar fits inside the viewport with no
                       outer scrollbar. */}
                <aside className="lg:col-span-4 lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:flex lg:flex-col gap-8 lg:gap-6 xl:gap-8 space-y-8 lg:space-y-0">
                  {/* TOP — header */}
                  <header className="lg:shrink-0 space-y-4">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] uppercase tracking-[0.1em] font-bold opacity-[0.52]">
                        Vol. {folio}
                      </span>
                      <div className="h-[1px] flex-1 bg-white/10" />
                    </div>
                    <StoryHeading className={`${sharedEntry ? 'text-2xl md:text-3xl lg:text-4xl' : 'text-3xl md:text-4xl lg:text-5xl'} overflow-hidden py-1 font-serif uppercase leading-[0.85] tracking-tighter`}>
                      <motion.span
                        key={collection._id}
                        className="block"
                        initial={reduce ? false : { y: '110%' }}
                        animate={{ y: photoRevealReady ? '0%' : '110%' }}
                        transition={{
                          duration: reduce ? 0 : sharedEntry ? 0.35 : 0.85,
                          delay: reduce ? 0 : sharedEntry ? sharedPanelDelay : 0.1,
                          ease: expo,
                        }}
                      >
                        {collection.name}
                      </motion.span>
                    </StoryHeading>
                    <div className="flex items-center gap-4">
                      {distinctLocation && (
                        <p className="text-[10px] uppercase tracking-[0.1em] font-bold">
                          {distinctLocation}
                        </p>
                      )}
                      {distinctLocation && collection.year && (
                        <div className="w-1 h-1 rounded-full bg-white/20" />
                      )}
                      <p className="text-[10px] uppercase tracking-[0.1em] opacity-[0.58] font-ui italic">
                        {collection.year || ''}
                      </p>
                    </div>
                  </header>

                  {/* A horizontal opening frame gets a dedicated mobile plate.
                      All-portrait stories begin with their paired grid instead,
                      preserving the rule that a portrait never becomes a lone
                      viewport-sized wall. */}
                  {photos[0] && editorialRows[0]?.layout === 'wide' && (
                    <motion.button
                      type="button"
                      onClick={(event) => openLightbox(0, event.currentTarget)}
                      data-frame-index={0}
                      initial={reduce ? false : { opacity: 0, y: 18 }}
                      animate={photoRevealReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
                      transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.18, ease: expo }}
                      className="group relative -mx-6 block w-[calc(100%+3rem)] overflow-hidden bg-black/20 text-left lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#D2FF00]"
                      aria-label={`Open opening frame, ${photoAccessibleLabel(photos[0], 0, photos.length, collection.name)}`}
                    >
                      <img
                        src={`${photos[0].imageUrl}?auto=format&w=900&q=82`}
                        alt={photoAccessibleLabel(photos[0], 0, photos.length, collection.name)}
                        width={photos[0].width}
                        height={photos[0].height}
                        loading="eager"
                        decoding="async"
                        fetchPriority="high"
                        onError={() => setOpeningFrameError(true)}
                        className={`block h-auto w-full ${openingFrameError ? 'invisible' : ''}`}
                        draggable={false}
                      />
                      {openingFrameError && (
                        <span className="absolute inset-0 flex items-center justify-center bg-[#292e25] font-ui text-[9px] uppercase tracking-[0.28em] text-white/58">
                          Frame unavailable
                        </span>
                      )}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/55 to-transparent px-5 pb-4 pt-14 font-ui text-[9px] uppercase tracking-[0.24em] text-white/78">
                        <span>Opening frame</span>
                        <span>01 / {String(photos.length).padStart(2, '0')}</span>
                      </span>
                    </motion.button>
                  )}

                  {/* MIDDLE — editorial introduction. Scrolls inside its own
                       box if the narrative is long, so the bottom region
                       (progress + map) stays pinned. */}
                  {(() => {
                    const hasIntro = collection.introduction && collection.introduction.length > 0;
                    const fallbackParas = collection.slug ? EDITORIAL_FALLBACKS[collection.slug] : null;
                    const showDescriptionFallback = !hasIntro && !fallbackParas && collection.description;
                    if (!hasIntro && !fallbackParas && !showDescriptionFallback) {
                      return <div className="flex-1 min-h-0" />;
                    }
                    return (
                      <div
                        role="region"
                        aria-label={`${collection.name} introduction`}
                        tabIndex={0}
                        // Set as reading text rather than as an epigraph. It was
                        // styled as a pull quote — whole-block italic at 80%
                        // opacity behind a floated open-quote with no close —
                        // which is how captions and quotations are set, not the
                        // one passage a chapter has. Roman, full contrast, one
                        // paragraph. The measure is set by the 352px sticky rail,
                        // not by `max-w`, so the size stays at 15px: roman glyphs
                        // are wider than italic ones, and measured in that rail
                        // 16px roman already fell to ~39 characters a line, below
                        // the 45–90 reading range.
                        className="max-w-[68ch] lg:flex-1 lg:min-h-0 lg:overflow-y-auto no-scrollbar lg:pr-2 lg:-mr-2 text-[15px] leading-[1.65] text-pretty font-serif text-white/88 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]/60"
                      >
                        {/* One paragraph: the chapter's lead, not its whole text. */}
                        {hasIntro
                          ? renderPortableText(collection.introduction!.slice(0, 1), 'border-white/15')
                          : fallbackParas
                            ? renderFallback(fallbackParas.slice(0, 1))
                            : <p>{collection.description}</p>}
                      </div>
                    );
                  })()}

                  {/* BOTTOM — pinned: scroll progress + frame count + mini-map */}
                  <footer className="lg:shrink-0 space-y-5">
                    {/* Scroll progress — the bar binds scaleX straight to the
                        scroll MotionValue (compositor-only, zero re-renders);
                        the % label isolates its own state so scrolling a story
                        re-renders one <span>, not the whole overlay tree. */}
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold opacity-[0.62]">
                        <span>Reading Progress</span>
                        <ProgressPercent progress={scrollYProgress} />
                      </div>
                      <div className="h-[1px] w-full bg-white/[0.09] relative overflow-hidden">
                        <motion.div
                          className="absolute top-0 left-0 h-full w-full origin-left bg-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]"
                          style={{ scaleX: scrollYProgress }}
                        />
                      </div>
                    </div>

                    {/* Frame count — compact line */}
                    <div className="hidden lg:flex items-center gap-3 text-[10px] uppercase tracking-[0.1em] font-ui opacity-[0.62]">
                      <div className="w-8 h-[1px] bg-white opacity-30" />
                      <span>{photos.length} Captured Frames</span>
                    </div>

                  </footer>
                </aside>

                {/* Orientation-aware photo sequence. Landscapes may open into
                    a wide plate; portraits share the line so no vertical frame
                    becomes an accidental full-screen wall. */}
                {/* Rows sit 32–40px apart so each caption reads as belonging to the frame
                    above it. The old 8–12px spacing was set for bare images; with a
                    caption ~10px under each one, it left the caption equidistant
                    from its own photograph and the next. */}
                <div className="lg:col-span-8 space-y-8 md:space-y-10">
                  {editorialRows.map((row, rowIdx) => (
                    <EditorialRowFrames
                      key={row.items.map(({ photo }) => photo._id).join('-')}
                      spaced={rowIdx > 0 && rowIdx % 4 === 0}
                      /* The first two rows ride the cover hand-off; later rows
                         wait until the reader reaches them. */
                      leading={rowIdx < 2}
                      revealReady={photoRevealReady}
                    >
                      {row.items.map(({ photo, index }, posInRow) => (
                        <PhotoCell
                          key={photo._id}
                          photo={photo}
                          posInRow={posInRow}
                          develops={row.layout === 'wide' || row.layout === 'portrait-solo'}
                          span={
                            row.layout === 'wide'
                              ? 'full'
                              : row.layout === 'trio'
                                ? 'third'
                                : row.layout === 'portrait-solo'
                                  ? 'portrait'
                                  : 'half'
                          }
                          index={index}
                          total={photos.length}
                          frameNumber={index + 1}
                          collectionName={collection.name}
                          hoveredIndex={hoveredIndex}
                          setHoveredIndex={setHoveredIndex}
                          onClick={(element) => openLightbox(index, element)}
                          canHover={canHover}
                          revealReady={photoRevealReady}
                          hideOnMobile={index === 0 && row.items.length === 1}
                        />
                      ))}
                    </EditorialRowFrames>
                  ))}
                  <footer className="pt-24 md:pt-32 pb-12 flex flex-col items-center gap-16 md:gap-24 border-t border-white/5">
                      {/* Next Story */}
                      {nextCollection && (
                        /* The end of a chapter arrives when the reader reaches
                           it: label, then the next name masks up, then its
                           cover develops — rather than all of it having
                           happened somewhere below the fold. */
                        <button
                          ref={endCapRef}
                          type="button"
                          className="w-full min-h-11 flex flex-col items-center gap-10 md:gap-12 group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
                          onClick={(event) => {
                            // A standalone /works page turns by navigating, and
                            // the whole document is replaced; there is nothing
                            // here for a plane to grow into.
                            if (standalone) {
                              onSelectCollection(nextCollection);
                              return;
                            }
                            const card = event.currentTarget.querySelector<HTMLElement>('[data-next-cover]');
                            beginPageTurn(nextCollection, card ?? event.currentTarget);
                          }}
                          aria-label={`Read next story: ${nextCollection.name}`}
                        >
                          <motion.span
                            className="text-[10px] uppercase tracking-[0.1em] font-bold opacity-[0.56]"
                            initial={reduce ? false : { opacity: 0 }}
                            animate={{ opacity: endCapShown ? 0.56 : 0 }}
                            transition={{ duration: reduce ? 0 : 0.34, ease: expo }}
                          >
                            Keep Reading
                          </motion.span>
                          <span className="flex flex-col items-center gap-8">
                            <Magnetic strength={0.32}>
                              <span className="flex items-center gap-4 text-4xl md:text-6xl font-serif uppercase tracking-tighter overflow-hidden py-1">
                                <motion.span
                                  className="block"
                                  initial={reduce ? false : { y: '115%' }}
                                  animate={{ y: reduce || endCapShown ? '0%' : '115%' }}
                                  transition={{ duration: reduce ? 0 : 0.8, delay: reduce || !endCapShown ? 0 : 0.12, ease: expo }}
                                >
                                  {nextCollection.name}
                                </motion.span>
                                <ArrowRight size={22} className="shrink-0 text-[#D2FF00] transition-transform duration-500 group-hover:translate-x-1.5" />
                              </span>
                            </Magnetic>
                            {nextCollection.coverImageUrl && (
                              <motion.span
                                data-next-cover
                                className="block h-[150px] w-60 overflow-hidden transition-opacity duration-500 group-hover:opacity-100"
                                style={reduce ? undefined : DEVELOP_MASK_STYLE}
                                initial={reduce ? false : { opacity: 0, y: 14, WebkitMaskPosition: '100% 0%', maskPosition: '100% 0%' }}
                                animate={reduce || endCapShown
                                  ? { opacity: 0.55, y: 0, WebkitMaskPosition: '0% 0%', maskPosition: '0% 0%' }
                                  : { opacity: 0, y: 14, WebkitMaskPosition: '100% 0%', maskPosition: '100% 0%' }}
                                transition={reduce ? { duration: 0 } : {
                                  opacity: { duration: 0.3, delay: endCapShown ? 0.28 : 0, ease: expo },
                                  y: { duration: 0.8, delay: endCapShown ? 0.28 : 0, ease: popEase },
                                  WebkitMaskPosition: { duration: 0.8, delay: endCapShown ? 0.28 : 0, ease: developEase },
                                  maskPosition: { duration: 0.8, delay: endCapShown ? 0.28 : 0, ease: developEase },
                                }}
                              >
                                <img
                                  src={`${nextCollection.coverImageUrl}?auto=format&w=600&q=60`}
                                  alt={nextCollection.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  draggable={false}
                                />
                              </motion.span>
                            )}
                          </span>
                        </button>
                      )}

                      <div className="flex flex-col md:flex-row items-center justify-center gap-12 w-full">
                        <motion.button
                          onClick={handleShare}
                          whileHover={reduce ? undefined : { y: -2 }}
                          whileTap={reduce ? undefined : { scale: 0.94 }}
                          transition={{ duration: 0.2, ease: expo }}
                          className="group flex min-h-11 min-w-11 flex-col items-center gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
                          aria-label="Share this story"
                        >
                          <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover:text-[#282c20] group-hover:border-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] transition-colors duration-300">
                            {isShared ? <Check size={16} /> : <Share2 size={16} />}
                          </div>
                          <span className="text-[10px] uppercase tracking-[0.1em] font-bold opacity-[0.56] group-hover:opacity-100 transition-opacity duration-300">
                            {isShared ? 'Link Copied' : 'Share Story'}
                          </span>
                        </motion.button>

                        <motion.button
                          onClick={backToStoryTop}
                          whileHover={reduce ? undefined : { y: -2 }}
                          whileTap={reduce ? undefined : { scale: 0.94 }}
                          transition={{ duration: 0.2, ease: expo }}
                          className="group flex min-h-11 min-w-11 flex-col items-center gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
                          aria-label="Back to the top of this story"
                        >
                          <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover:text-[#282c20] group-hover:border-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] transition-colors duration-300">
                            <ArrowRight className="-rotate-90" size={16} />
                          </div>
                          <span className="text-[10px] uppercase tracking-[0.1em] font-bold opacity-[0.56] group-hover:opacity-100 transition-opacity duration-300">
                            Back to Top
                          </span>
                        </motion.button>
                      </div>
                      <div className={shareFallbackUrl ? 'w-full max-w-lg -mt-8 space-y-3' : 'sr-only'}>
                        <p role="status" aria-live="polite" aria-atomic="true" className="text-center font-ui text-[11px] leading-relaxed text-white/68">
                          {shareStatus}
                        </p>
                        {shareFallbackUrl && (
                          <input
                            type="text"
                            tabIndex={0}
                            readOnly
                            value={shareFallbackUrl}
                            aria-label="Story link — select and copy"
                            onFocus={(event) => event.currentTarget.select()}
                            onClick={(event) => event.currentTarget.select()}
                            className="min-h-11 w-full rounded-sm border border-white/20 bg-white/[0.035] px-3 font-ui text-[12px] text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]"
                          />
                        )}
                      </div>
                  </footer>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Editorial cover intro — printed "front page" that holds the
             screen as the story opens, then peels up to reveal the grid.
             Strong newspaper character: masthead + double rule + column
             rules + halftone screen + folio. ── */}
        <AnimatePresence onExitComplete={() => setCoverExited(true)}>
          {(!coverGone || !!pendingStory) && (
            <motion.div
              /* Keyed on the story the cover ANNOUNCES. During a page turn that
                 is the pending one, so when `collection` catches up a moment
                 later the key does not change and the plane is never remounted
                 mid-turn. */
              key={`cover-${coverStory._id}`}
              aria-hidden="true"
              /* The plane starts as the card the reader clicked and grows to
                 fill the shell. `transformOrigin: 0 0` makes that two numbers
                 and a translate, on the compositor, with no layout. */
              initial={pendingStory
                ? {
                    y: pendingStory.box.y,
                    x: pendingStory.box.x,
                    scaleX: pendingStory.box.width / window.innerWidth,
                    scaleY: pendingStory.box.height / window.innerHeight,
                  }
                : { y: 0 }}
              animate={{ x: 0, y: 0, scaleX: 1, scaleY: 1 }}
              exit={{ y: '-100%' }}
              /* The cover arrives on the same curve it leaves on. House expo is
                 so front-loaded that the plane was 84% of the way across in its
                 first 117ms — a pop, not a travel; the cover's own peel curve
                 spends the time in the middle of the move, where the growing
                 card is actually legible as the page it is becoming. */
              transition={pendingStory
                ? { duration: reduce ? 0 : COVER_EXPAND_MS / 1000, ease: [0.76, 0, 0.24, 1] }
                : { duration: reduce ? 0 : 0.72, ease: [0.76, 0, 0.24, 1] }}
              style={{ transformOrigin: '0 0' }}
              className="pointer-events-none absolute inset-0 z-[75] overflow-hidden bg-[#30352a] text-[#F4F4ED]"
            >
              {/* Every collection enters through the same quiet image field.
                  Where an archive map exists it remains the preferred layer;
                  otherwise the collection cover supplies a calm, factual
                  fallback instead of dropping to an unrelated blank state. */}
              {coverBackdrop && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  initial={{ scale: 1.12, opacity: 0 }}
                  animate={coverArrived ? { scale: 1, opacity: 1 } : { scale: 1.12, opacity: 0 }}
                  transition={{ duration: 1.3, ease: expo }}
                >
                  <img
                    src={coverBackdrop}
                    alt=""
                    width={2000}
                    height={1126}
                    className="w-full h-full object-cover"
                    decoding="async"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-[#30352a]/64" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#30352a] via-[#30352a]/24 to-[#30352a]/62" />
                </motion.div>
              )}

              {/* Newsprint halftone screen */}
              <div className="newsprint-screen pointer-events-none absolute inset-0 opacity-[0.06]" />
              {/* Accent wash bottom-left */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(50vmax 40vmax at 18% 110%, rgba(var(--accent-r,255),var(--accent-g,255),var(--accent-b,255),0.10), transparent 68%)' }}
              />

              {/* Newspaper column rules */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-4 opacity-50">
                {[0, 1, 2, 3].map((i) => (
                  <motion.span
                    key={i}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: coverArrived ? 1 : 0 }}
                    transition={{ duration: 0.7, delay: 0.06 + i * 0.06, ease: expo }}
                    className="origin-top"
                    style={{ borderRight: i === 3 ? '0' : '1px solid rgba(255,255,255,0.05)' }}
                  />
                ))}
              </div>

              {/* Masthead / running head + double rule */}
              <motion.div
                initial={{ clipPath: 'inset(0 100% 0 0)' }}
                animate={{ clipPath: coverArrived ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)' }}
                transition={{ duration: 0.65, delay: 0.1, ease: expo }}
                className="absolute"
                style={{
                  top: 'clamp(1.5rem,4vh,3rem)',
                  left: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-left))',
                  right: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-right))',
                }}
              >
                <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-white/20 font-ui text-[10px] tracking-[0.1em] uppercase">
                  <span className="font-medium text-white/60">The Journal Gallery</span>
                  <span className="text-white/58">Vol. 01 · {coverStory.year || 'Archive'}</span>
                </div>
                <div className="mt-[3px] border-b border-white/10" />
              </motion.div>

              {/* Center editorial block */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center" style={{ paddingLeft: '6vw', paddingRight: '6vw' }}>
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={coverArrived ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                  transition={{ duration: 0.44, delay: 0.18, ease: expo }}
                  className="font-ui text-[11px] tracking-[0.5em] uppercase"
                  style={{ color: 'rgba(var(--accent-r,255),var(--accent-g,255),var(--accent-b,255),0.85)' }}
                >
                  // dispatch № {coverFolio}
                </motion.span>
                <h2 className="m-0 overflow-hidden" style={{ padding: '0.04em 0.02em' }}>
                  <motion.span
                    initial={{ y: '110%' }}
                    animate={{ y: coverArrived ? '0%' : '110%' }}
                    transition={{ duration: 0.68, delay: 0.24, ease: expo }}
                    className="inline-block font-serif uppercase font-normal leading-[0.92] tracking-tight text-white/[0.98]"
                    style={{ fontSize: 'clamp(42px,7.5vw,112px)' }}
                  >
                    {coverStory.name}
                  </motion.span>
                </h2>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={coverArrived ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                  transition={{ duration: 0.46, delay: 0.34, ease: expo }}
                  className="flex items-center gap-3 font-ui text-[10px] tracking-[0.1em] uppercase text-white/58"
                >
                  {coverLocation && <span>{coverLocation}</span>}
                  {coverLocation && (
                    <span className="w-[3px] h-[3px] rounded-full" style={{ background: 'rgba(var(--accent-r,255),var(--accent-g,255),var(--accent-b,255),0.7)' }} />
                  )}
                  <span>{coverFrameCount} Frames</span>
                </motion.div>
              </div>

              {/* Folio / page number */}
              <motion.div
                initial={{ clipPath: 'inset(0 0 0 100%)' }}
                animate={{ clipPath: coverArrived ? 'inset(0 0 0 0%)' : 'inset(0 0 0 100%)' }}
                transition={{ duration: 0.65, delay: 0.12, ease: expo }}
                className="absolute flex items-baseline justify-between gap-4 pt-2 border-t border-white/20 font-ui text-[10px] tracking-[0.1em] uppercase text-white/58"
                style={{
                  bottom: 'max(clamp(1.5rem,4vh,3rem), env(safe-area-inset-bottom))',
                  left: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-left))',
                  right: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-right))',
                }}
              >
                <span className="text-[13px] tracking-[0.2em] text-white/55">{coverFolio}</span>
                <span>The Story Begins</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </StoryShell>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <LightboxShell
            photos={photos}
            activeIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            collectionName={collection.name}
            origin={lightboxOrigin}
            resolveTarget={resolveFrameTarget}
          />
        )}
      </AnimatePresence>
    </>
  );
}
