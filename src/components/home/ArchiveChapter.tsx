import { Fragment, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState, useMemo } from 'react';
import {
  animate,
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useReducedMotion,
  type MotionStyle,
  type MotionValue,
} from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { Collection } from '../../types';
import { excerpt } from '../../lib/narratives';
import { useHoverCapable } from '../../lib/useHoverCapable';
import { ARCHIVE_ENTRANCE_PHASES, entrancePhase } from '../../lib/archiveEntrance';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const expo = [0.16, 1, 0.3, 1] as const;
const EMPTY_PRELOAD_IMAGE_URLS: readonly string[] = [];
const PRELOADED_IMAGE_URLS = new Set<string>();

interface ArchiveChapterProps {
  id: string;
  collection: Collection;
  onClick: () => void;
  /** Display order used by the visible chapter number. */
  index: number;
  isActive: boolean;
  /** Position of the shared homepage chapter timeline. Fractional values blend
   *  the focus treatment continuously between neighbouring chapters. */
  chapterProgress?: MotionValue<number>;
  /** Optional opener-to-archive handoff. Used only by the first desktop cover
   *  so it can unfold like the first page of a film album. */
  handoffProgress?: MotionValue<number>;
  /** Timeline position when it differs from the visible display order. */
  chapterIndex?: number;
  /** Minimal shared-element hooks for a later Homepage -> Story handoff. */
  sharedLayoutId?: string;
  sharedImageRef?: React.Ref<HTMLDivElement>;
  sharedImageSourceRef?: React.Ref<HTMLImageElement>;
  /** Optional neighbouring cover base URLs. They are decoded only while this
   *  chapter is active, using the same responsive candidate as the real image. */
  preloadImageUrls?: readonly string[];
  /** Eager-load only the current/adjacent cover (plus the first cover). */
  prioritizeImage?: boolean;
  /** Shares the cover's hover/focus lock with the geographic atlas. */
  onEngagementChange?: (chapterId: string | null) => void;
  /** Its place is pointed at on the map: the cover answers as if hovered. */
  highlighted?: boolean;
  /** 'cover' (default) = full-bleed magazine cover; 'feature' = a 2-column
   *  editorial spread (image + a text rail) used for the opening chapter. */
  variant?: 'feature' | 'cover';
  /** Desktop archive only: the scroll-owned cover reveal, the masked title
   *  rise and the focus-driven title weight. The mobile route story keeps its
   *  own quieter treatment. */
  desktopMotion?: boolean;
}

// Fraunces is served as a variable font (wght 400–900). The title thickens as
// its chapter takes focus and thins again as it leaves — the weight follows the
// same shared chapter timeline as the photograph's matte and scale.
const TITLE_WEIGHT_REST = 400;
const TITLE_WEIGHT_FOCUS = 640;
// A chapter's title rises once, the first time the timeline comes this close.
const TITLE_RISE_DISTANCE = 0.62;
// Film pulled out of its canister: the frame is cropped open from the bottom
// edge while the photograph inside settles from a slight overscan. Pure crop
// and uniform scale — the picture itself is never warped.
const COVER_REVEAL_RANGE = [0.03, 0.3] as const;
const COVER_REVEAL_OVERSCAN = 1.2;

// Match RouteAtlas's quintic smootherstep exactly. The photograph's focus,
// matte and copy now accelerate and settle on the same curve as the map halo,
// route head and left-hand directory.
const smoothFocus = (value: number) =>
  value * value * value * (value * (value * 6 - 15) + 10);

/**
 * ArchiveChapter — a collection's homepage entry. Two layouts:
 *  - 'cover'   : a tall full-bleed photo with the name set large ON the image
 *                (the default, with the masthead crossing the map/photo seam).
 *  - 'feature' : an editorial 2-column spread (image + a text rail with the
 *                subtitle deck, an excerpt, a dateline, and the CTA) — used once,
 *                for the opener, to break the look-alike stack.
 * Hover keeps the same photograph, with a slow breath and a quiet story cue.
 */
export default function ArchiveChapter({
  id,
  collection,
  onClick,
  index,
  isActive,
  chapterProgress,
  handoffProgress,
  chapterIndex,
  sharedLayoutId,
  sharedImageRef,
  sharedImageSourceRef,
  preloadImageUrls = EMPTY_PRELOAD_IMAGE_URLS,
  prioritizeImage = false,
  onEngagementChange,
  highlighted = false,
  variant = 'cover',
  desktopMotion = false,
}: ArchiveChapterProps) {
  const chapterRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const interactiveHover = canHover && !reduce;
  const engaged = (canHover && isHovered) || isFocused || highlighted;
  const engagementTarget = useMotionValue(0);
  const engagementDepth = useSpring(engagementTarget, {
    stiffness: 250,
    damping: 28,
    mass: 0.62,
  });
  const pointerTargetX = useMotionValue(0);
  const pointerTargetY = useMotionValue(0);
  const pointerX = useSpring(pointerTargetX, { stiffness: 150, damping: 25, mass: 0.58 });
  const pointerY = useSpring(pointerTargetY, { stiffness: 150, damping: 25, mass: 0.58 });
  const interactionDepth = reduce ? engagementTarget : engagementDepth;
  const hoverScale = useTransform(interactionDepth, [0, 1], [1, reduce ? 1 : 1.014]);

  const titlePointerX = useTransform(pointerX, (value) => reduce ? 0 : value * -0.32);
  const titleOpenX = useTransform(interactionDepth, [0, 1], [0, reduce ? 0 : -4]);

  const plateCueOpacity = useTransform(interactionDepth, [0, 1], [0.42, 0.9]);
  const plateCueX = useTransform(interactionDepth, [0, 1], [0, reduce ? 0 : 4]);
  const photoBoundsRef = useRef<DOMRect | null>(null);
  const engagementRef = useRef(false);
  // A highlight from the map lights the cover without reporting engagement
  // back (that would only echo the id the map already has).
  useEffect(() => {
    if (highlighted) engagementTarget.set(1);
    else if (!engagementRef.current) engagementTarget.set(0);
  }, [engagementTarget, highlighted]);

  const setEngagement = (next: boolean) => {
    engagementTarget.set(next ? 1 : 0);
    if (!next) {
      pointerTargetX.set(0);
      pointerTargetY.set(0);
      photoBoundsRef.current = null;
    }
    if (engagementRef.current === next) return;
    engagementRef.current = next;
    onEngagementChange?.(next ? collection._id : null);
  };

  const handlePhotoPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactiveHover || event.pointerType === 'touch') return;
    photoBoundsRef.current = event.currentTarget.getBoundingClientRect();
  };

  const handlePhotoPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactiveHover || event.pointerType === 'touch') return;
    const rect = photoBoundsRef.current ?? event.currentTarget.getBoundingClientRect();
    photoBoundsRef.current = rect;
    const x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
    const y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
    pointerTargetX.set(x * 10);
    pointerTargetY.set(y * 6);
  };

  const handlePhotoPointerLeave = () => {
    pointerTargetX.set(0);
    pointerTargetY.set(0);
    photoBoundsRef.current = null;
  };

  // A stationary pointer can stay over the cover while the page moves. Read
  // fresh geometry on its next movement, without measuring on every scroll.
  useEffect(() => {
    if (!isHovered || !interactiveHover) return;
    const invalidateBounds = () => { photoBoundsRef.current = null; };
    window.addEventListener('scroll', invalidateBounds, { passive: true, capture: true });
    window.addEventListener('resize', invalidateBounds, { passive: true });
    return () => {
      window.removeEventListener('scroll', invalidateBounds, true);
      window.removeEventListener('resize', invalidateBounds);
    };
  }, [isHovered, interactiveHover]);

  useEffect(() => () => {
    if (engagementRef.current) onEngagementChange?.(null);
  }, [onEngagementChange]);

  const resolvedChapterIndex = chapterIndex ?? index;
  const fallbackChapterProgress = useMotionValue(
    isActive ? resolvedChapterIndex : resolvedChapterIndex + 1,
  );
  const fallbackHandoffProgress = useMotionValue(1);
  const resolvedChapterProgress = chapterProgress ?? fallbackChapterProgress;
  const resolvedHandoffProgress = handoffProgress ?? fallbackHandoffProgress;
  const [entryInteractive, setEntryInteractive] = useState(() =>
    !handoffProgress || !!reduce || resolvedHandoffProgress.get() >= 0.52,
  );
  useEffect(() => {
    if (!handoffProgress || reduce) {
      setEntryInteractive(true);
      return;
    }
    let available = resolvedHandoffProgress.get() >= 0.52;
    setEntryInteractive(available);
    return resolvedHandoffProgress.on('change', (progress) => {
      const next = progress >= 0.52;
      if (next === available) return;
      available = next;
      setEntryInteractive(next);
    });
  }, [handoffProgress, reduce, resolvedHandoffProgress]);

  // Existing callers can continue to drive the component with `isActive`.
  // Once the parent provides a shared fractional timeline, every chapter reads
  // that same MotionValue and this fallback becomes inert.
  useEffect(() => {
    if (chapterProgress) return;
    const target = isActive ? resolvedChapterIndex : resolvedChapterIndex + 1;
    if (reduce) {
      fallbackChapterProgress.set(target);
      return;
    }
    const controls = animate(fallbackChapterProgress, target, {
      duration: 0.72,
      ease: expo,
    });
    return () => controls.stop();
  }, [chapterProgress, fallbackChapterProgress, isActive, reduce, resolvedChapterIndex]);

  // The shared timeline also choreographs the editorial handoff. Treat the
  // outgoing and incoming chapter differently: the chapter being left gives
  // up contrast first, while the approaching chapter keeps more photographic
  // presence and resolves its copy slightly later. At the exact midpoint the
  // map route remains the visual lead instead of two cards competing equally.
  const chapterDelta = useTransform(resolvedChapterProgress, (position) =>
    Math.max(-1, Math.min(1, position - resolvedChapterIndex)),
  );
  const focusScale = useTransform(chapterDelta, (delta) => {
    if (reduce) return 1;
    const distance = smoothFocus(Math.abs(delta));
    // Incoming frames hold a fraction more overscan so they appear to settle
    // into focus; outgoing frames recede without an obvious reverse zoom.
    return 1 + distance * (delta < 0 ? 0.038 : 0.026);
  });
  const scrollMatteOpacity = useTransform(chapterDelta, (delta) => {
    if (reduce) return Math.round(delta) === 0 ? 0.24 : 0.42;
    const distance = smoothFocus(Math.abs(delta));
    return 0.24 + distance * (delta < 0 ? 0.18 : 0.27);
  });
  const matteOpacity = useTransform(
    [scrollMatteOpacity, interactionDepth],
    ([matte, interaction]) => Math.max(0.12, Number(matte) - Number(interaction) * 0.085),
  );
  const editorialOpacity = useTransform(chapterDelta, (delta) => {
    if (reduce) return Math.round(delta) === 0 ? 1 : 0.72;
    const distance = smoothFocus(Math.abs(delta));
    return 1 - distance * (delta < 0 ? 0.3 : 0.52);
  });
  const editorialShift = useTransform(chapterDelta, (delta) => {
    if (reduce) return 0;
    const distance = smoothFocus(Math.abs(delta));
    return distance * (delta < 0 ? 14 : -12);
  });
  const fieldNoteOpacity = useTransform(chapterDelta, (delta) => {
    if (reduce) return Math.round(delta) === 0 ? 1 : 0.68;
    const distance = smoothFocus(Math.abs(delta));
    return 1 - distance * (delta < 0 ? 0.38 : 0.62);
  });
  const fieldNoteShift = useTransform(chapterDelta, (delta) => {
    if (reduce) return 0;
    const distance = smoothFocus(Math.abs(delta));
    return distance * (delta < 0 ? 18 : -10);
  });

  const { scrollYProgress } = useScroll({ target: chapterRef, offset: ['start end', 'end start'] });
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.92, 1], [0, 1, 1, 0.26]);
  // Keep the existing vertical arrival and internal parallax. Scale now belongs
  // to the shared chapter focus, avoiding a second competing zoom timeline.
  const entryY = useTransform(scrollYProgress, [0, 0.38], [52, 0], { clamp: true });
  // Covers after the first open by crop instead of the 52px fade-up. The first
  // cover keeps its album unfold, which already owns the archive entrance.
  const coverReveal = desktopMotion && !handoffProgress && !reduce;
  const revealOpen = useTransform(scrollYProgress, (progress) => {
    if (!coverReveal) return 1;
    const [start, end] = COVER_REVEAL_RANGE;
    const value = Math.max(0, Math.min(1, (progress - start) / (end - start)));
    return 1 - Math.pow(1 - value, 3);
  });
  const revealClip = useTransform(revealOpen, (open) =>
    open >= 1 ? 'inset(0% 0% 0% 0%)' : `inset(${((1 - open) * 100).toFixed(3)}% 0% 0% 0%)`,
  );
  const mediaScale = useTransform([focusScale, revealOpen], ([focus, open]) =>
    Number(focus) * (1 + (COVER_REVEAL_OVERSCAN - 1) * (1 - Number(open))),
  );
  const titleWeight = useTransform(chapterDelta, (delta) => {
    if (!desktopMotion || reduce) return TITLE_WEIGHT_REST;
    const focus = 1 - smoothFocus(Math.abs(delta));
    return Math.round(TITLE_WEIGHT_REST + (TITLE_WEIGHT_FOCUS - TITLE_WEIGHT_REST) * focus);
  });
  // The masked rise plays once per visit, the first time this chapter nears
  // focus. The first cover is excluded: its type already arrives on the
  // entrance score (titleArrival).
  const titleRiseEnabled = desktopMotion && !handoffProgress && !reduce;
  const [titleRisen, setTitleRisen] = useState(!titleRiseEnabled);
  useEffect(() => {
    if (!titleRiseEnabled) {
      setTitleRisen(true);
      return;
    }
    if (titleRisen) return;
    if (Math.abs(chapterDelta.get()) < TITLE_RISE_DISTANCE) {
      setTitleRisen(true);
      return;
    }
    return chapterDelta.on('change', (delta) => {
      if (Math.abs(delta) < TITLE_RISE_DISTANCE) setTitleRisen(true);
    });
  }, [chapterDelta, titleRiseEnabled, titleRisen]);
  const albumOpen = useTransform(resolvedHandoffProgress, (progress) => {
    if (reduce || !handoffProgress) return 1;
    return entrancePhase(progress, ...ARCHIVE_ENTRANCE_PHASES.film);
  });
  const titleArrival = useTransform(resolvedHandoffProgress, (progress) =>
    reduce || !handoffProgress ? 1 : entrancePhase(progress, ...ARCHIVE_ENTRANCE_PHASES.type),
  );
  const detailArrival = useTransform(resolvedHandoffProgress, (progress) =>
    reduce || !handoffProgress ? 1 : entrancePhase(progress, ...ARCHIVE_ENTRANCE_PHASES.details),
  );
  const albumScale = useTransform(albumOpen, [0, 1], [0.945, 1]);
  const albumRotateX = useTransform(albumOpen, [0, 1], [6, 0]);
  const albumClip = useTransform(albumOpen, (open) =>
    `inset(${(1 - open) * 18}% 0% ${(1 - open) * 30}% 0%)`,
  );
  const albumPhotoY = useTransform(albumOpen, (open) => (1 - Number(open)) * 88);
  const coverCopyOpacity = useTransform([editorialOpacity, titleArrival], ([focus, entry]) => Number(focus) * Number(entry));
  const coverDetailOpacity = useTransform([fieldNoteOpacity, detailArrival], ([focus, entry]) => Number(focus) * Number(entry));
  const coverDetailY = useTransform([fieldNoteShift, detailArrival], ([shift, entry]) => Number(shift) + (1 - Number(entry)) * 24);
  const coverTitleY = useTransform(titleArrival, [0, 1], [34, 0]);
  // Cover text planes counter-parallax against the photo — the masthead lifts,
  // the kicker sinks as the card passes, so name/kicker/photo read as depth.
  const mastheadY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '-16%']);
  const kickerY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '22%']);
  const titleInteractionX = useTransform(
    [editorialShift, titlePointerX, titleOpenX],
    ([timeline, pointer, open]) => Number(timeline) + Number(pointer) + Number(open),
  );

  // Keyword-ignite (the feature title's last word lights to lime on scroll-in) stays.
  const igniteColor = useTransform(scrollYProgress, [0.3, 0.52], ['rgba(244,244,237,1)', 'rgb(210,255,0)']);
  const nameParts = collection.name.trim().split(/\s+/);
  // Each word rises inside its own mask, a line at a time — words are never
  // split into letters, so screen readers still hear whole words. The mask's
  // padding is cancelled by an equal negative margin, leaving layout and the
  // h3's drop-shadow (drawn from the composited heading) untouched.
  const risingWords = (words: string[], wordStyle?: (word: string, index: number) => MotionStyle | undefined) =>
    words.map((word, wordIndex) => (
      <Fragment key={`${word}-${wordIndex}`}>
        {wordIndex > 0 && ' '}
        <span className="archive-title-mask">
          <motion.span
            className="inline-block"
            initial={false}
            animate={{ y: titleRisen ? '0%' : '118%' }}
            transition={titleRisen
              ? { duration: 0.8, delay: wordIndex * 0.08, ease: expo }
              : { duration: 0 }}
            style={wordStyle?.(word, wordIndex)}
          >
            {word}
          </motion.span>
        </span>
      </Fragment>
    ));

  const coverBase = collection.coverImageUrl ?? collection.photos?.[0]?.imageUrl ?? '';
  // A photograph is never given a design ratio: the cover takes the file's
  // own, clamped the way 11 mois clamps its plates (a tall 9:20 to a wide
  // 2.4:1). Sanity puts the pixel dimensions in the asset's file name, so the
  // frame is right on the first paint — no measuring, no layout shift.
  const coverRatio = useMemo(() => {
    const match = /-(\d+)x(\d+)\.[a-z]+/i.exec(coverBase);
    if (!match) return null;
    const ratio = Number(match[1]) / Number(match[2]);
    return Number.isFinite(ratio) && ratio > 0 ? Math.min(2.4, Math.max(0.45, ratio)) : null;
  }, [coverBase]);
  const plateRatio = variant === 'cover' ? coverRatio : null;
  const coverUrl = coverBase ? `${coverBase}?auto=format&w=1600&q=82` : '';
  const coverSrcSet = coverBase
    ? `${coverBase}?auto=format&w=1000&q=82 1000w, ${coverBase}?auto=format&w=1600&q=82 1600w, ${coverBase}?auto=format&w=2000&q=78 2000w`
    : undefined;

  // The visible <img> owns the current cover. Predecode only its neighbours,
  // with the exact same srcset/sizes contract, so a responsive 1000/2000px
  // candidate is not followed by a redundant fixed 1600px request.
  useEffect(() => {
    if ((!isActive && resolvedChapterIndex !== 0) || typeof Image === 'undefined') return;
    const bases = Array.from(new Set(preloadImageUrls.filter(Boolean))).filter((base) => {
      if (PRELOADED_IMAGE_URLS.has(base)) return false;
      PRELOADED_IMAGE_URLS.add(base);
      return true;
    });
    const images = bases.map((base) => {
      const image = new Image();
      image.decoding = 'async';
      image.sizes = '(min-width: 1900px) 1100px, (min-width: 1024px) 58vw, 100vw';
      image.srcset = `${base}?auto=format&w=1000&q=82 1000w, ${base}?auto=format&w=1600&q=82 1600w, ${base}?auto=format&w=2000&q=78 2000w`;
      image.src = `${base}?auto=format&w=1600&q=82`;
      if (typeof image.decode === 'function') {
        void image.decode().catch(() => PRELOADED_IMAGE_URLS.delete(base));
      }
      return image;
    });
    return () => {
      images.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [isActive, preloadImageUrls, resolvedChapterIndex]);

  const frames = collection.photoCount ?? collection.photos?.length ?? 0;
  const dateline = collection.location || collection.region || 'United States';
  const deck = collection.subtitle?.trim();
  const lede = excerpt(collection.slug, 220);
  const coverTitleSize = collection.name.trim().length > 10
    ? 'clamp(54px, 6.3vw, 92px)'
    : 'clamp(64px, 7.2vw, 108px)';

  const aspectClass =
    variant === 'feature'
      ? 'aspect-[4/5] lg:aspect-[5/6]'
      : 'aspect-[4/5] sm:aspect-[16/11] lg:aspect-[16/10]';

  // The film rebate sits inside the existing frame geometry. The geographic
  // timeline keeps the same centre, while one continuous image owns the cover.
  const imageBlock = (
    <motion.div
      ref={sharedImageRef}
      layoutId={sharedLayoutId}
      onPointerEnter={handlePhotoPointerEnter}
      onPointerMove={handlePhotoPointerMove}
      onPointerLeave={handlePhotoPointerLeave}
      style={variant === 'cover' ? {
        ...(plateRatio ? { aspectRatio: String(plateRatio) } : null),
        clipPath: handoffProgress ? albumClip : coverReveal ? revealClip : undefined,
      } : coverReveal ? { clipPath: revealClip } : undefined}
      className={`archive-photo-frame relative ${plateRatio ? '' : aspectClass} overflow-hidden`}
    >
      <div className="absolute inset-0">
        {/* Shared focus layer — exact centre at 1; adjacent/far chapters top out
            at a restrained 1.035. No blur is used for the depth cue. */}
        <motion.div className="absolute inset-0" style={{ scale: mediaScale }}>
          <motion.div
            className="absolute inset-0"
            style={{ x: pointerX, y: pointerY, scale: hoverScale }}
          >
            {coverUrl && (
              <motion.img
                ref={sharedImageSourceRef}
                src={coverUrl}
                srcSet={coverSrcSet}
                sizes="(min-width: 1900px) 1100px, (min-width: 1024px) 58vw, 100vw"
                alt={collection.name}
                loading={prioritizeImage ? 'eager' : 'lazy'}
                fetchPriority={prioritizeImage && (isActive || resolvedChapterIndex === 0) ? 'high' : 'auto'}
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            )}
          </motion.div>
        </motion.div>
        <motion.div
          className="absolute inset-0 bg-[#30352a] pointer-events-none"
          style={{ opacity: matteOpacity }}
        />
        <div className="archive-photo-shade-top pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-[linear-gradient(180deg,rgba(24,28,20,0.54)_0%,rgba(24,28,20,0.16)_52%,transparent_100%)]" />
        <div className="archive-photo-shade-bottom pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-[linear-gradient(0deg,rgba(20,24,17,0.72)_0%,rgba(20,24,17,0.30)_44%,transparent_100%)]" />
      </div>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-5 right-[max(1.25rem,env(safe-area-inset-right))] z-10 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/14 bg-[#171b15]/72 px-4 font-ui text-[9px] uppercase tracking-[0.24em] text-white/76 shadow-[0_10px_28px_rgba(7,9,6,0.18)] lg:hidden"
      >
        View story <ArrowRight size={12} />
      </span>
    </motion.div>
  );

  const activate = () => {
    if (!entryInteractive) return;
    setIsHovered(false);
    setIsFocused(false);
    setEngagement(false);
    onClick();
  };
  const interactive = {
    onClick: activate,
    ...(canHover && {
      onHoverStart: () => {
        setIsHovered(true);
        setEngagement(true);
      },
      onHoverEnd: () => {
        setIsHovered(false);
        setEngagement(isFocused);
      },
    }),
    onFocus: (e: React.FocusEvent) => {
      const visible = e.currentTarget.matches(':focus-visible');
      setIsFocused(visible);
      if (visible) setEngagement(true);
    },
    // Keyboard focus and physical pointer presence are independent. Clearing
    // hover here made the photograph freeze while it was still under a cursor.
    onBlur: () => {
      setIsFocused(false);
      setEngagement(canHover && isHovered);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) activate();
      }
    },
    'data-cursor': 'Enter Story',
    whileTap: reduce ? undefined : { scale: 0.996 },
    role: 'button' as const,
    tabIndex: entryInteractive ? 0 : -1,
    inert: !entryInteractive,
    'aria-hidden': !entryInteractive || undefined,
    'aria-label': `View story: ${collection.name}`,
  };
  const baseline = (
    <motion.div
      className="absolute left-0 right-0 bottom-0 z-10 h-[5px] origin-left"
      style={{ background: ACCENT }}
      animate={{ scaleX: engaged ? 1 : 0 }}
      transition={{ duration: reduce ? 0 : engaged ? 0.3 : 0.5, ease: expo }}
    />
  );

  // ── FEATURE — editorial 2-column spread ──
  // Carries the same diagnostic markers as the cover so the chapter stack can
  // be inspected uniformly, whichever variant a chapter renders.
  if (variant === 'feature') {
    return (
      <motion.section
        id={id}
        ref={chapterRef}
        data-archive-chapter="true"
        data-chapter-index={resolvedChapterIndex}
        data-active={isActive ? 'true' : 'false'}
        style={{ opacity: reduce ? 1 : opacity, y: reduce || coverReveal ? 0 : entryY }}
        className="relative pb-12 lg:pb-20"
      >
        <motion.div
          {...interactive}
          className="group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00] lg:grid lg:grid-cols-12 lg:items-center lg:gap-12"
        >
          <div className="relative overflow-hidden border border-white/5 bg-white/[0.02] transition-colors duration-700 group-hover:border-white/15 lg:col-span-8">
            {imageBlock}
            {baseline}
          </div>

          <div className="lg:col-span-4 mt-8 lg:mt-0 flex flex-col gap-5">
            <p className="text-kicker flex items-center gap-2 text-white/55">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
              In&nbsp;the&nbsp;Archive · Nº&nbsp;{String(index + 1).padStart(2, '0')}
            </p>
            <motion.h3
              className="font-serif uppercase text-white tracking-tight leading-[0.88]"
              style={{ fontSize: 'clamp(40px, 5vw, 84px)', fontWeight: titleWeight }}
            >
              {risingWords(nameParts, (_word, wordIndex) =>
                wordIndex === nameParts.length - 1
                  ? { color: reduce ? 'rgb(210,255,0)' : igniteColor }
                  : undefined,
              )}
            </motion.h3>
            {deck && <p className="text-deck max-w-[32ch]">{deck}</p>}
            {lede && <p className="text-[13.5px] leading-relaxed text-white/62 font-light max-w-[42ch]">{lede}</p>}
            <div className="h-px w-16" style={{ background: ACCENT }} />
            <span aria-hidden="true" className="mt-1 inline-flex min-h-11 shrink-0 items-center gap-3 font-ui text-[10px] uppercase tracking-[0.1em] text-white/80 md:text-[11px]">
              View Story
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 transition-[border-color,background-color,color] duration-500 group-hover:border-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover:bg-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover:text-[#282c20]">
                <ArrowRight size={16} />
              </span>
            </span>
          </div>
        </motion.div>
      </motion.section>
    );
  }

  // ── COVER (default) — full-bleed magazine cover ──
  return (
    <motion.section
      id={id}
      ref={chapterRef}
      data-archive-chapter="true"
      data-chapter-index={resolvedChapterIndex}
      data-active={isActive ? 'true' : 'false'}
      style={{
        opacity: reduce ? 1 : opacity,
        y: reduce || coverReveal ? 0 : entryY,
      }}
      className="relative overflow-visible pb-12 lg:pb-16"
    >
      <motion.div
        {...interactive}
        className="group relative w-full cursor-pointer overflow-visible focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
      >
        <div className="relative">
          <motion.div
            style={{
              opacity: reduce ? 1 : coverCopyOpacity,
              y: reduce ? 0 : coverTitleY,
              x: reduce ? 0 : titleInteractionX,
            }}
            className="pointer-events-none absolute -top-8 left-0 right-0 z-20 hidden items-center justify-between font-ui text-[9px] uppercase tracking-[0.28em] lg:flex"
          >
            <span className="text-white/54">Chapter {String(index + 1).padStart(2, '0')}</span>
            <span className="mr-[1%] text-right text-white/58">
              {dateline}{collection.year ? ` · ${collection.year}` : ''}
            </span>
          </motion.div>
          {/* The plate: the photograph at its own ratio, capped so a tall one
              still fits the reading line, with the camera's focus corners on
              its own four corners instead of a film rebate. */}
          <div
            className="archive-plate relative"
            style={plateRatio ? { maxWidth: `calc(78vh * ${plateRatio})` } : undefined}
          >
            {/* One transformed stage holds the photograph, the corners that
                declare its edges and its cue, so the frame can never be
                somewhere the picture is not. The photograph's own crop
                (clipPath) stays on the image inside it. */}
            <motion.div
              className="archive-plate__stage"
              style={{
                y: albumPhotoY,
                opacity: albumOpen,
                scale: albumScale,
                rotateX: albumRotateX,
                transformPerspective: 1600,
                transformOrigin: '50% 100%',
              }}
            >
              {imageBlock}
              <span aria-hidden="true" className="archive-focus" data-focused={isActive ? 'true' : undefined}>
                <i /><i /><i /><i />
              </span>
              <motion.span
                aria-hidden="true"
                className="archive-plate__cue"
                style={{ x: plateCueX, opacity: plateCueOpacity }}
              >
                Open story
                <ArrowRight size={13} strokeWidth={1.4} />
              </motion.span>
            </motion.div>
          </div>

          {/* Compact screens retain the original in-image running head. */}
          <motion.div
            style={{
              y: reduce ? 0 : kickerY,
              opacity: reduce ? 1 : coverCopyOpacity,
              x: reduce ? 0 : titleInteractionX,
            }}
            className="absolute inset-x-0 top-0 flex items-start p-5 pt-24 font-ui text-[10px] uppercase tracking-[0.1em] md:p-8 md:pt-20 md:text-[11px] lg:hidden"
          >
            <span className="flex max-w-[78%] items-center gap-2 text-white/72">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} />
              {String(index + 1).padStart(2, '0')} · {collection.name}{collection.year ? ` · ${collection.year}` : ''}
            </span>
          </motion.div>

          {/* The title is deliberately not contained by the photograph. It
              crosses the map/photo seam like the selected Figure 1 direction. */}
          <motion.div
            style={{
              y: reduce ? 0 : mastheadY,
              x: reduce ? 0 : titleInteractionX,
              opacity: reduce ? 1 : coverCopyOpacity,
              bottom: 'clamp(-52px, -3.6vw, -34px)',
            }}
            className="archive-cover-title-wrap pointer-events-none absolute left-[-6%] z-20 max-w-[106%] whitespace-normal lg:left-[-14%] lg:max-w-[94%]"
          >
            <motion.h3
              className="archive-cover-title font-serif uppercase leading-[0.78] tracking-[-0.05em] text-[#F4F4ED] drop-shadow-[0_5px_36px_rgba(8,10,7,0.62)]"
              style={{ fontSize: coverTitleSize, wordSpacing: '0.12em', y: coverTitleY, fontWeight: titleWeight }}
            >
              {desktopMotion ? risingWords(nameParts) : collection.name}
            </motion.h3>
          </motion.div>
        </div>
        {/* Borderless field notes: the text sits directly on the page instead of
          adding another card beneath the photograph. */}
        <motion.div
          style={reduce ? undefined : { opacity: coverDetailOpacity, y: coverDetailY }}
          className="relative z-30 ml-[-12%] mt-[clamp(64px,6.5vw,92px)] hidden w-[88%] grid-cols-[96px_minmax(0,1fr)] items-start gap-x-8 pr-3 lg:grid"
        >
        <div className="pt-1 font-ui uppercase">
          <p className="text-[10px] tracking-[0.1em] text-[#D2FF00]">{frames} frames</p>
          <span className="mt-5 block h-px w-10 bg-[#D2FF00]/65" />
        </div>

        <div className="min-w-0">
          <p className="max-w-[48ch] font-serif text-[16px] leading-[1.55] text-white/64">
            {lede || deck || `A photographic dispatch from ${dateline}.`}
          </p>
        </div>
        </motion.div>

        <motion.div
          style={reduce ? undefined : { opacity: fieldNoteOpacity, y: fieldNoteShift }}
          className="relative z-30 mt-[clamp(72px,18vw,96px)] px-5 pr-6 lg:hidden"
        >
          <p className="font-ui text-[9px] uppercase tracking-[0.1em] text-[#D2FF00]/86">{frames} frames</p>
          <p className="mt-4 max-w-[34ch] font-serif text-[15px] leading-[1.5] text-white/66">
            {lede || deck || `A photographic dispatch from ${dateline}.`}
          </p>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
