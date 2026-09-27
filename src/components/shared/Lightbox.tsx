import { Fragment, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence, useIsPresent, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Photo } from '../../types';
import { photoAccessibleLabel, photoDescription } from '../../lib/narratives';
import { fileDims, lightboxImageSources, prepareLightboxImage } from '../../lib/lightboxImage';
import { CSS_EASE, DUR, DUR_MS, EASE } from '../../lib/motion';

/** The on-screen box of the frame the reader clicked, so the viewer can open
 *  out of it. `src` is the picture that frame was showing, already decoded
 *  (its `currentSrc`): the viewer wears it until its own, larger file has
 *  arrived, so the flight out of the frame carries pixels from its first
 *  frame on any network. */
export interface LightboxOrigin { x: number; y: number; width: number; height: number; src?: string }

/** The frame a given index belongs to, resolved at the moment it is needed. */
export interface LightboxTarget { box: LightboxOrigin; node: HTMLElement }

interface LightboxProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  collectionName?: string;
  /** Where the viewer opens from (the clicked frame's box). */
  origin?: LightboxOrigin | null;
  /**
   * Where the viewer should go BACK to — the frame for whatever index is
   * showing when it closes, which after paging is not the frame it opened
   * from. Called once, at close, so the box is measured after any lazy image
   * has loaded and after any resize; returns null when that frame is not on
   * screen (a breakpoint-hidden cell), and the viewer then simply recedes.
   */
  resolveTarget?: (index: number) => LightboxTarget | null;
}

/** What moved the viewer to the next frame. A key gets its own, faster time. */
type FrameSource = 'pointer' | 'key' | 'touch';
interface SwapCue { direction: number; source: FrameSource }

// Pointer and touch: the slide-and-settle, 0.32s on the house ease.
const slideVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction * 22,
    scale: 0.99,
  }),
  visible: { opacity: 1, x: 0, scale: 1 },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -16,
    scale: 0.99,
  }),
};
// Keyboard: a held arrow is a riffle through a contact sheet, not a slide
// projector. Opacity only, one step per frame or so — any longer becomes a
// tax paid a few hundred times a session.
const riffleTransition = { duration: 0.1, ease: 'linear' as const };
const riffleVariants = {
  enter: { opacity: 0, x: 0, scale: 1 },
  visible: { opacity: 1, x: 0, scale: 1, transition: riffleTransition },
  exit: { opacity: 0, x: 0, scale: 1, transition: riffleTransition },
};
// Chosen per swap from the cue rather than by swapping the `variants` prop:
// AnimatePresence re-renders the LEAVING frame with the props it mounted
// with, but hands it the current `custom`, so this is the only place a
// pointer-mounted frame can learn it is now leaving under a key.
const photoVariants = {
  enter: (cue: SwapCue) => (cue.source === 'key' ? riffleVariants.enter : slideVariants.enter(cue.direction)),
  visible: (cue: SwapCue) => (cue.source === 'key' ? riffleVariants.visible : slideVariants.visible),
  exit: (cue: SwapCue) => (cue.source === 'key' ? riffleVariants.exit : slideVariants.exit(cue.direction)),
};

/** How far a caption value travels when it swaps. The sentence takes the
 *  site's full writing-line rise into its mask; a measurement leaves further
 *  than it arrives, so at 11px the eye catches a departure, not a glitch. */
const captionRise = {
  sentence: { enter: '110%', leave: '-110%', arrive: 0.32, depart: 0.2 },
  measure: { enter: '80%', leave: '-110%', arrive: 0.2, depart: 0.16 },
} as const;
type CaptionRise = (typeof captionRise)[keyof typeof captionRise];
/** `hard` swaps the text with no travel: reduced motion, or a key riffle
 *  that would otherwise strobe the line. */
interface CaptionCue { rise: CaptionRise; hard: boolean }

const captionVariants = {
  enter: ({ rise }: CaptionCue) => ({ y: rise.enter }),
  rest: { y: '0%' },
  // Resolved against the presence cue (see photoVariants), so a value that
  // arrived by pointer still leaves hard when a key overtakes it.
  leave: ({ rise, hard }: CaptionCue) => (hard
    ? { y: '0%', opacity: 0, transition: { duration: 0 } }
    : { y: rise.leave, transition: { duration: rise.depart, ease: EASE.arrive } }),
};

/** One value inside a caption mask. The leaving copy is lifted out of flow
 *  by hand — no popLayout, which would measure the row on every swap while
 *  the same thread decodes a 2000px frame; the mask's inner span is already
 *  the containing block. */
function CaptionValue({ cue, className, children }: { cue: CaptionCue; className: string; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.span
      custom={cue}
      variants={captionVariants}
      initial={cue.hard ? false : 'enter'}
      animate="rest"
      exit="leave"
      transition={{ duration: cue.hard ? 0 : cue.rise.arrive, ease: EASE.arrive }}
      className={`${present ? '' : 'absolute left-0 top-0 '}${className}`}
    >
      {children}
    </motion.span>
  );
}

/** A fixed caption slot. The key carries the slot name: an unchanged value
 *  keeps its node and never moves; two slots holding the same string never
 *  collide. The padding / negative-margin pair gives descenders room inside
 *  the mask without changing the line's height. */
function CaptionSlot({ slot, value, cue, className, valueClassName }: {
  slot: string;
  value: string;
  cue: CaptionCue;
  className?: string;
  valueClassName: string;
}) {
  return (
    <span className={`inline-block max-w-full overflow-hidden px-[0.06em] py-[0.16em] -mx-[0.06em] -my-[0.16em] ${className ?? ''}`}>
      <span className="relative block">
        <AnimatePresence initial={false} custom={cue}>
          <CaptionValue key={`${slot}:${value}`} cue={cue} className={valueClassName}>
            {value}
          </CaptionValue>
        </AnimatePresence>
      </span>
    </span>
  );
}

/**
 * Shared Lightbox — fullscreen photo viewer
 * Keyboard ← → navigate · Escape close · touch swipe
 */
export default function Lightbox({ photos, initialIndex, onClose, collectionName, origin, resolveTarget }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [requestedIndex, setRequestedIndex] = useState(initialIndex);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [loadingFrame, setLoadingFrame] = useState(false);
  const [failedRequest, setFailedRequest] = useState<number | null>(null);
  const requestedIndexRef = useRef(initialIndex);
  const requestVersionRef = useRef(0);
  const [direction, setDirection] = useState<-1 | 1>(1);
  // The source of the latest request, and the source of the frame that most
  // recently landed. The first is a ref because a held key writes it many
  // times per commit; the second is state because the render reads it.
  const sourceRef = useRef<FrameSource>('pointer');
  const [swapSource, setSwapSource] = useState<FrameSource>('pointer');
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(() => new Set());
  const photo = photos[index];
  const imageFailed = failedPhotoIds.has(photo._id);
  // The photograph's own shape, from its file name (or the asset's metadata),
  // so its box is the resting box before its file arrives. The width is the
  // largest that fits the viewer's 92vw × 78dvh, which is exactly the box
  // max-w/max-h would have given the loaded image (global.css,
  // .gallery-lightbox-photo--sized). Unknown shape: the image sizes itself.
  const frameShape = fileDims(photo.imageUrl)
    ?? (photo.width && photo.height ? { width: photo.width, height: photo.height } : null);
  // The frame the reader clicked, as the grid had already decoded it. The
  // opening photograph wears it underneath until its own file paints over
  // it; a frame paged to later has no such stand-in.
  const [standIn] = useState(() => (origin?.src ? { id: photos[initialIndex]?._id, src: origin.src } : null));
  // The viewer's heading: a written description if one exists, otherwise the
  // place. Never the machine title — "Miami #24" reads as a filename.
  const displayTitle = photoDescription(photo) || photo.location?.city?.trim() || collectionName || '';
  const currentPhotoLabel = photoAccessibleLabel(photo, index, photos.length, collectionName);
  // Print only what varies. Craig Mod's Leica Q essay publishes an exposure
  // triplet per frame but leaves out camera and focal length, because the
  // whole essay is one fixed-lens body — a constant dimension carries no
  // information and repeats on every frame. This archive uses two bodies and
  // mostly one focal length, so those two stay only when they actually change
  // within the set being viewed; aperture, shutter and ISO always show.
  const varies = useMemo(() => {
    const distinct = (pick: (entry: Photo) => string | undefined) =>
      new Set(photos.map((entry) => pick(entry)?.trim()).filter(Boolean)).size;
    return {
      camera: distinct((entry) => entry.camera) > 1,
      focalLength: distinct((entry) => entry.focalLength) > 1,
    };
  }, [photos]);
  // Fixed slots, so that paging reprints only the value that changed: the
  // shutter walking from 1/250 to 1/60 is visible because nothing else moved.
  const exposure = [
    { slot: 'camera', value: varies.camera ? photo.camera : undefined },
    { slot: 'focal', value: varies.focalLength ? photo.focalLength : undefined },
    { slot: 'aperture', value: photo.aperture },
    { slot: 'shutter', value: photo.shutterSpeed },
    { slot: 'iso', value: photo.iso ? `ISO ${String(photo.iso).replace(/^ISO\s*/i, '')}` : undefined },
  ].filter((entry): entry is { slot: string; value: string } => Boolean(entry.value?.trim()));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const reduce = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  // A key riffle swaps the caption hard along with the frame; a rising line
  // under a held arrow reads as a strobe. Reduced motion zeroes it the same way.
  const captionHard = Boolean(reduce) || swapSource === 'key';
  const sentenceCue = useMemo<CaptionCue>(() => ({ rise: captionRise.sentence, hard: captionHard }), [captionHard]);
  const measureCue = useMemo<CaptionCue>(() => ({ rise: captionRise.measure, hard: captionHard }), [captionHard]);
  // Under reduced motion the slide path is already zeroed by the transition
  // prop and the literal exit; routing the key there keeps that path as it was.
  const swapCue = useMemo<SwapCue>(
    () => ({ direction, source: reduce ? 'pointer' : swapSource }),
    [direction, reduce, swapSource],
  );
  // The opening flight's clean-up timer. A reader who opens and closes inside
  // 620ms would otherwise have the return flight wiped mid-air by the timer
  // the opening left behind.
  const settleTimerRef = useRef(0);
  // The viewer lifts out of the frame the reader clicked. The stage is
  // measured once, on mount, and placed over that frame before the first
  // paint; the next frame hands it to the compositor to travel back. The
  // stage has its resting box at mount whether or not the viewer's file has
  // arrived (the photograph is sized from its own shape, `frameShape`), so
  // this measures a real box on a first open too, not 0×0.
  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node || !origin || reduce) return;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const scale = Math.max(0.05, origin.width / box.width);
    const dx = origin.x + origin.width / 2 - (box.x + box.width / 2);
    const dy = origin.y + origin.height / 2 - (box.y + box.height / 2);
    node.style.transition = 'none';
    node.style.transformOrigin = 'center';
    node.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
    const frame = requestAnimationFrame(() => {
      node.style.transition = `transform ${DUR_MS.grow}ms ${CSS_EASE.arrive}`;
      node.style.transform = 'translate3d(0, 0, 0) scale(1)';
      settleTimerRef.current = window.setTimeout(() => {
        node.style.transition = '';
        node.style.transform = '';
      }, DUR_MS.grow + 60);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimerRef.current);
    };
  }, [origin, reduce]);
  const isPresent = useIsPresent();
  // The frame the viewer will hand itself back to. Held in a ref because the
  // unmount cleanup below — which is where focus is restored — runs after the
  // exit, long after the last render.
  const returnNodeRef = useRef<HTMLElement | null>(null);
  // Closing mirrors opening: the photograph travels back into the frame it
  // belongs to, rather than dissolving in the middle of the screen and leaving
  // the reader to find their place again. The frame is resolved HERE, once, at
  // the moment of closing — the reader may have paged several frames on from
  // the one they clicked, and that frame's box is only knowable now.
  useLayoutEffect(() => {
    if (isPresent) return;
    window.clearTimeout(settleTimerRef.current);
    const target = resolveTarget?.(index) ?? null;
    if (target?.node) returnNodeRef.current = target.node;
    const node = stageRef.current;
    if (!node || reduce) return;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) return;
    if (!target) {
      // Nothing to fly to (the frame is hidden at this breakpoint): recede.
      node.style.transition = `transform 300ms ${CSS_EASE.arrive}, opacity 300ms ${CSS_EASE.arrive}`;
      node.style.transformOrigin = 'center';
      node.style.transform = 'scale(0.965)';
      node.style.opacity = '0';
      return;
    }
    const scale = Math.max(0.05, target.box.width / box.width);
    const dx = target.box.x + target.box.width / 2 - (box.x + box.width / 2);
    const dy = target.box.y + target.box.height / 2 - (box.y + box.height / 2);
    node.style.transition = `transform 420ms ${CSS_EASE.arrive}`;
    node.style.transformOrigin = 'center';
    node.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  }, [index, isPresent, reduce, resolveTarget]);

  const requestFrame = useCallback((offset: number, source: FrameSource) => {
    const target = Math.max(0, Math.min(requestedIndexRef.current + offset, photos.length - 1));
    if (target === requestedIndexRef.current) return;
    requestVersionRef.current += 1;
    requestedIndexRef.current = target;
    sourceRef.current = source;
    setFailedRequest(null);
    setLoadingFrame(false);
    setRequestedIndex(target);
  }, [photos.length]);
  const goNext = useCallback((source: FrameSource) => requestFrame(1, source), [requestFrame]);
  const goPrev = useCallback((source: FrameSource) => requestFrame(-1, source), [requestFrame]);

  useEffect(() => {
    if (!isPresent) return;
    if (requestedIndex === index) {
      setLoadingFrame(false);
      return;
    }
    const version = requestVersionRef.current;
    // 400ms, not 220: a held key commits a frame every decode, and the label
    // must not flicker on every step that merely takes a little longer.
    const loadingTimer = window.setTimeout(() => setLoadingFrame(true), 400);
    const cancel = prepareLightboxImage(photos[requestedIndex].imageUrl, (ready) => {
      if (version !== requestVersionRef.current) return;
      window.clearTimeout(loadingTimer);
      setLoadingFrame(false);
      if (!ready) {
        setFailedRequest(requestedIndex);
        return;
      }
      setFailedRequest(null);
      setDirection(requestedIndex > index ? 1 : -1);
      setSwapSource(sourceRef.current);
      setIndex(requestedIndex);
    });
    return () => {
      window.clearTimeout(loadingTimer);
      cancel();
    };
  }, [requestedIndex, index, photos, retryAttempt, isPresent]);

  useEffect(() => {
    // One frame either side, and a second one in the direction of travel:
    // prefetch only warms from the COMMITTED index, so a held key that steps
    // once per decode would otherwise run ahead of it and every step go cold.
    [index - 1, index + 1, index + 2 * direction].forEach((photoIndex) => {
      const adjacentPhoto = photos[photoIndex];
      if (!adjacentPhoto) return;
      const image = new Image();
      image.decoding = 'async';
      const sources = lightboxImageSources(adjacentPhoto.imageUrl);
      image.sizes = sources.sizes;
      image.srcset = sources.srcSet;
      image.src = sources.src;
    });
  }, [index, direction, photos]);

  useEffect(() => {
    if (!isPresent) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext('key');
        else goPrev('key');
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose, goNext, goPrev, isPresent]);

  useEffect(() => {
    // Save/restore the previous overflow — the host overlay (MagazineLayout /
    // WorkStory) already locks body scroll; blind '' restore would unlock it
    // underneath the still-open story.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    return () => {
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(frame);
      // Hand the keyboard back to the frame the reader is actually on. Paging
      // with the arrows moves the viewer but never moved this: closing after
      // three frames used to drop focus back on the one originally clicked,
      // three cells behind where the eye was.
      const returning = returnNodeRef.current;
      const previous = previousFocusRef.current;
      const target = returning?.isConnected ? returning : previous;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    // A previous/next button disappears at the sequence edge; keep focus in the viewer.
    if (!dialogRef.current?.contains(document.activeElement)) {
      closeButtonRef.current?.focus({ preventScroll: true });
    }
  }, [index, requestedIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    const touch = e.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const diffX = start.x - touch.clientX;
    const diffY = start.y - touch.clientY;
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.25) {
      if (diffX > 0) goNext('touch');
      else goPrev('touch');
    }
  };

  return (
    <motion.div
      ref={dialogRef}
      id="lightbox"
      data-protected="true"
      role="dialog"
      aria-modal="true"
      aria-hidden={!isPresent || undefined}
      inert={!isPresent ? true : undefined}
      aria-label={collectionName ? `Photo viewer, ${collectionName}` : 'Photo viewer'}
      data-closing={!isPresent ? 'true' : undefined}
      className="fixed inset-0 z-[60] flex items-center justify-center"
      // zoom-out is the whole "click anywhere to close" hint; the two
      // stopPropagation subtrees below set themselves back to default.
      style={{ cursor: 'zoom-out' }}
      // The field is a property of this element, not a class, so it can
      // fade on its own while the photograph stays solid: opacity compounds
      // through a parent, so a root that fades takes the travelling picture
      // with it. On the way in the root's own opacity is simply 1 — the
      // photograph lifting out of its frame is solid from its first frame,
      // and only the field (here) and the controls (global.css,
      // .lightbox-chrome) come in. On the way out it is held at 1 until the
      // flight has all but landed, then spent in the last 130ms. The two are
      // separate transitions: sharing the exit's three-keyframe `times`, the
      // open's two-keyframe fade overshot to 1, fell back to 0.12 at 460ms
      // and let the story show through the photograph on every open.
      // The archive's own deepest ink (#0b0e09), not pure black, at the same
      // density. All three keyframes share it: framer interpolates between
      // them, and a black `initial`/`exit` would tint the 0.32s ramps.
      // Linear: on the house ease the field emptied in 150ms and the flight
      // then finished over a page that was already fully back.
      initial={reduce ? false : { opacity: 1, backgroundColor: 'rgba(11, 14, 9, 0)' }}
      animate={{ opacity: 1, backgroundColor: 'rgba(11, 14, 9, 0.97)' }}
      exit={{
        opacity: [1, 1, 0],
        backgroundColor: 'rgba(11, 14, 9, 0)',
        transition: reduce
          ? { duration: 0 }
          : {
              opacity: { duration: 0.46, times: [0, 0.72, 1], ease: 'linear' },
              backgroundColor: { duration: DUR.swap, ease: 'linear' },
            },
      }}
      transition={reduce ? { duration: 0 } : { backgroundColor: { duration: DUR.swap, ease: 'linear' } }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStartRef.current = null; }}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Showing {currentPhotoLabel}
      </span>
      {/* Close button — 44px tap target, safe-area-aware on iOS */}
      <motion.button
        ref={closeButtonRef}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        // Chrome never grows on hover (its border and ink answer, in CSS); a
        // press gives the same hair as every other control on the site.
        whileTap={reduce ? undefined : { scale: 0.96 }}
        transition={{ duration: DUR.in, ease: EASE.arrive }}
        className="lightbox-chrome absolute z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white/62 transition-colors duration-200 hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top))',
          right: 'max(0.75rem, env(safe-area-inset-right))',
        }}
        aria-label="Close photo viewer"
      >
        <X size={19} strokeWidth={1.5} aria-hidden="true" />
      </motion.button>

      {/* Photo (+ subtle anti-screenshot watermark overlay). The stage opens
           out of the frame that was clicked: one measurement at mount, then a
           compositor transform back to its resting box.
           One grid cell holds every photograph in it: paging, the leaving
           and the arriving frames share that cell, centred, and the stage
           keeps the larger of the two boxes until the leaving one has gone.
           (popLayout re-anchored the leaving frame to the stage's new left
           edge, so a landscape giving way to a portrait lurched 325px
           sideways in one frame before it faded.) */}
      <div ref={stageRef} className={`relative grid cursor-default place-items-center ${imageFailed ? 'h-[min(60dvh,32rem)] w-[min(92vw,48rem)] bg-[#171b15]' : ''}`} onClick={(e) => e.stopPropagation()}>
        {imageFailed && (
          <p className="col-start-1 row-start-1 font-ui text-[10px] uppercase tracking-[0.1em] text-white/58">
            Frame unavailable
          </p>
        )}
        <AnimatePresence initial={false} custom={swapCue}>
          <motion.img
            key={photo._id}
            custom={swapCue}
            {...lightboxImageSources(photo.imageUrl)}
            width={frameShape?.width}
            height={frameShape?.height}
            alt={currentPhotoLabel}
            decoding="async"
            onError={() => setFailedPhotoIds((ids) => new Set(ids).add(photo._id))}
            onLoad={() => setFailedPhotoIds((ids) => {
              if (!ids.has(photo._id)) return ids;
              const next = new Set(ids);
              next.delete(photo._id);
              return next;
            })}
            className={`gallery-lightbox-photo col-start-1 row-start-1 max-h-[78dvh] max-w-[92vw] select-none object-contain ${frameShape ? 'gallery-lightbox-photo--sized' : ''} ${imageFailed ? 'hidden' : ''}`}
            style={{
              ...(frameShape && {
                ['--frame-ratio' as never]: frameShape.width / frameShape.height,
                aspectRatio: `${frameShape.width} / ${frameShape.height}`,
              }),
              // The clicked frame's decoded picture, under the viewer's own
              // file until that file paints over it (same photograph, same
              // shape, so `cover` is exact).
              ...(standIn && standIn.id === photo._id && {
                backgroundImage: `url(${JSON.stringify(standIn.src)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }),
            }}
            variants={photoVariants}
            initial={reduce ? false : 'enter'}
            animate="visible"
            exit={reduce ? { opacity: 0, x: 0, scale: 1 } : 'exit'}
            transition={{ duration: reduce ? 0 : 0.32, ease: EASE.arrive }}
            draggable={false}
          />
        </AnimatePresence>
        {/* Persistent watermark — overlays the image bounding box so screenshots
             of the lightbox include attribution. Mix-blend-difference keeps it
             legible against any image color while staying visually quiet. */}
        <div
          className="pointer-events-none absolute bottom-2 right-3 text-[9px] font-ui tracking-[0.1em] uppercase opacity-50 select-none"
          style={{ mixBlendMode: 'difference', color: 'white' }}
        >
          © ryanxugallery.com
        </div>
      </div>

      {/* Left arrow */}
      {requestedIndex > 0 && (
        <motion.button
          onClick={(e) => { e.stopPropagation(); goPrev('pointer'); }}
          // Hover leans the way it goes, by the site's 2px; no growth.
          whileHover={reduce ? undefined : { x: -2 }}
          whileTap={reduce ? undefined : { scale: 0.96 }}
          transition={{ duration: DUR.in, ease: EASE.arrive }}
          className="lightbox-chrome absolute top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/32 text-white/58 transition-colors duration-200 hover:border-white/25 hover:text-white md:h-12 md:w-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
          style={{ left: 'max(0.75rem, env(safe-area-inset-left))' }}
          aria-label={`Previous photo, ${requestedIndex} of ${photos.length}`}
        >
          <ChevronLeft size={24} strokeWidth={1.25} aria-hidden="true" />
        </motion.button>
      )}

      {/* Right arrow */}
      {requestedIndex < photos.length - 1 && (
        <motion.button
          onClick={(e) => { e.stopPropagation(); goNext('pointer'); }}
          whileHover={reduce ? undefined : { x: 2 }}
          whileTap={reduce ? undefined : { scale: 0.96 }}
          transition={{ duration: DUR.in, ease: EASE.arrive }}
          className="lightbox-chrome absolute top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/32 text-white/58 transition-colors duration-200 hover:border-white/25 hover:text-white md:h-12 md:w-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
          style={{ right: 'max(0.75rem, env(safe-area-inset-right))' }}
          aria-label={`Next photo, ${requestedIndex + 2} of ${photos.length}`}
        >
          <ChevronRight size={24} strokeWidth={1.25} aria-hidden="true" />
        </motion.button>
      )}

      {/* Bottom info — wraps gracefully on narrow viewports */}
      <div
        className="lightbox-chrome absolute left-1/2 flex w-[90vw] max-w-3xl -translate-x-1/2 cursor-default flex-col items-center gap-2 md:gap-3"
        style={{ bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 0.25rem))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div role="status" aria-live="polite" aria-atomic="true" className="absolute bottom-full mb-3 flex items-center gap-3 text-[10px] font-ui tracking-wide text-white/60">
          {failedRequest !== null ? (
            <>
              <span>Frame {failedRequest + 1} could not load.</span>
              <button
                type="button"
                className="min-h-11 px-2 text-white/85 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D2FF00]"
                onClick={() => {
                  requestVersionRef.current += 1;
                  setFailedRequest(null);
                  setRetryAttempt((attempt) => attempt + 1);
                }}
              >Retry</button>
            </>
          ) : loadingFrame ? `Preparing frame ${requestedIndex + 1}…` : null}
        </div>
        <div className="flex items-center gap-3 md:gap-4 max-w-full">
          {/* Written and measured are two different kinds of line. The one
              human sentence on this screen is set in the text face; the count,
              like every other number here, stays in the metadata face. */}
          {displayTitle && (
            <CaptionSlot
              slot="title"
              value={displayTitle}
              cue={sentenceCue}
              className="min-w-0"
              valueClassName="block truncate font-serif text-[15px] leading-snug tracking-normal text-white/72"
            />
          )}
          {/* The count stays a hard tabular swap: a rolling ordinal under a
              held key is noise. */}
          <span className="shrink-0 font-ui text-[11px] tracking-[0.1em] tabular-nums text-white/58">
            {index + 1} / {photos.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 font-ui text-[11px] tracking-[0.1em] tabular-nums text-white/58">
          {exposure.map(({ slot, value }, partIndex) => (
            <Fragment key={slot}>
              {/* The separators are structure; only the values move. */}
              {partIndex > 0 && <span className="text-white/40" aria-hidden="true">|</span>}
              <CaptionSlot slot={slot} value={value} cue={measureCue} valueClassName="block whitespace-nowrap" />
            </Fragment>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
