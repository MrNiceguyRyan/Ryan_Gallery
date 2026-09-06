import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  motion,
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from 'framer-motion';
import type { RouteStop } from './RouteAtlas';

interface Props {
  stops: RouteStop[];
  activeIndex: number;
  mobile: boolean;
  reducedMotion: boolean;
  paused: boolean;
  atlas: ReactNode;
  onOpen: (stop: RouteStop) => void;
  onNavigate: (anchorId: string) => void;
  chapterProgress?: MotionValue<number>;
}

const expo = [0.16, 1, 0.3, 1] as const;

function imageUrl(url: string, width: number) {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}auto=format&w=${width}&q=84`;
}

interface DecodedImageRecord {
  image: HTMLImageElement;
  ready: Promise<boolean>;
}

const decodedImageCache = new Map<string, DecodedImageRecord>();

/**
 * Resolve only after the exact source used by the visible layer can be painted.
 * Failed requests are removed from the cache so a later chapter visit can retry.
 */
function decodeImage(src: string, priority: 'high' | 'low' = 'low') {
  if (!src || typeof Image === 'undefined') return Promise.resolve(!src);
  const cached = decodedImageCache.get(src);
  if (cached) return cached.ready;

  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = priority;
  const request = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ready);
    };

    image.onload = () => {
      image.decode()
        .then(() => finish(image.naturalWidth > 0))
        .catch(() => finish(image.naturalWidth > 0));
    };
    image.onerror = () => finish(false);
    image.src = src;

    // Cached resources can be complete before the load handler is dispatched.
    if (image.complete) {
      image.decode()
        .then(() => finish(image.naturalWidth > 0))
        .catch(() => finish(image.naturalWidth > 0));
    }
  }).then((ready) => {
    if (!ready) decodedImageCache.delete(src);
    return ready;
  });

  // Retain the decoded element alongside the promise. Keeping that reference
  // alive lets the visible React image reuse the browser's decoded raster,
  // rather than merely its downloaded bytes, at the transition boundary.
  decodedImageCache.set(src, { image, ready: request });
  return request;
}

interface VisualChapter {
  stop: RouteStop;
  index: number;
  src: string;
}

function visualChapterKey(chapter: VisualChapter) {
  return `${chapter.stop.id}::${chapter.src}`;
}

function clampChapter(value: number, total: number) {
  if (!Number.isFinite(value) || total <= 1) return 0;
  return Math.max(0, Math.min(total - 1, value));
}

function smoothChapterWeight(progress: number, index: number) {
  const proximity = Math.max(0, 1 - Math.abs(progress - index));
  return proximity * proximity * (3 - 2 * proximity);
}

function formatCoordinate(value: number, positive: string, negative: string) {
  const normalized = Math.abs(value) < 0.00005 ? 0 : value;
  return `${Math.abs(normalized).toFixed(4)}° ${normalized >= 0 ? positive : negative}`;
}

function ScrubbedPhotoLayer({
  chapter,
  progress,
  selected,
  reducedMotion,
  photoX,
  photoY,
}: {
  chapter: VisualChapter;
  progress: MotionValue<number>;
  selected: boolean;
  reducedMotion: boolean;
  photoX: MotionValue<number>;
  photoY: MotionValue<number>;
}) {
  const opacity = useTransform(progress, (value) => smoothChapterWeight(value, chapter.index));
  const scale = useTransform(progress, (value) => 1 + Math.min(1, Math.abs(value - chapter.index)) * 0.012);

  return (
    <motion.div
      className="living-atlas__photo-layer absolute -inset-[3%]"
      style={reducedMotion
        ? { opacity: selected ? 1 : 0 }
        : { opacity, scale, x: photoX, y: photoY }}
    >
      {chapter.src && (
        <img
          src={chapter.src}
          alt=""
          className="h-full w-full object-cover"
          loading="eager"
          decoding="async"
          draggable={false}
        />
      )}
      <div className="living-atlas__photo-grade absolute inset-0" />
    </motion.div>
  );
}

function ScrubbedCaptionLayer({
  chapter,
  progress,
  selected,
  reducedMotion,
  children,
}: {
  chapter: VisualChapter;
  progress: MotionValue<number>;
  selected: boolean;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const opacity = useTransform(progress, (value) => smoothChapterWeight(value, chapter.index));
  const y = useTransform(progress, (value) => {
    const offset = Math.max(-1, Math.min(1, value - chapter.index));
    return offset * -10;
  });

  return (
    <motion.div
      className={`absolute inset-0 ${selected ? '' : 'pointer-events-none'}`}
      style={reducedMotion ? { opacity: selected ? 1 : 0 } : { opacity, y }}
      aria-hidden={selected ? undefined : 'true'}
    >
      {children}
    </motion.div>
  );
}

function ScrubbedCoordinateReadout({
  stops,
  progress,
}: {
  stops: RouteStop[];
  progress: MotionValue<number>;
}) {
  const latitudeRef = useRef<HTMLSpanElement>(null);
  const longitudeRef = useRef<HTMLSpanElement>(null);

  const write = (value: number) => {
    if (!stops.length) return;
    const clamped = clampChapter(value, stops.length);
    const fromIndex = Math.floor(clamped);
    const toIndex = Math.min(stops.length - 1, fromIndex + 1);
    const local = clamped - fromIndex;
    const eased = local * local * (3 - 2 * local);
    const from = stops[fromIndex]?.coordinates ?? stops[0].coordinates;
    const to = stops[toIndex]?.coordinates ?? from;
    const longitude = from[0] + (to[0] - from[0]) * eased;
    const latitude = from[1] + (to[1] - from[1]) * eased;
    if (latitudeRef.current) latitudeRef.current.textContent = formatCoordinate(latitude, 'N', 'S');
    if (longitudeRef.current) longitudeRef.current.textContent = formatCoordinate(longitude, 'E', 'W');
  };

  useMotionValueEvent(progress, 'change', write);
  useEffect(() => write(progress.get()), [progress, stops]);

  const initial = stops[0]?.coordinates ?? [0, 0];
  return (
    <div className="mt-3 font-ui text-[8px] uppercase tracking-[0.24em] text-[#D2FF00]/70 md:text-[9px]">
      <span ref={latitudeRef}>{formatCoordinate(initial[1], 'N', 'S')}</span>
      <span aria-hidden="true">&nbsp;&nbsp;/&nbsp;&nbsp;</span>
      <span ref={longitudeRef}>{formatCoordinate(initial[0], 'E', 'W')}</span>
    </div>
  );
}

function chapterWindow(total: number, active: number, limit: number) {
  if (total <= limit) return Array.from({ length: total }, (_, index) => index);
  const start = Math.max(0, Math.min(active - 1, total - limit));
  return Array.from({ length: limit }, (_, index) => start + index);
}

function yearRange(stops: RouteStop[]) {
  const years = stops
    .map((stop) => Number(stop.year))
    .filter((year) => Number.isFinite(year) && year > 1900);
  if (!years.length) return '2023—2026';
  // The archive began in 2023 even when the currently published chapters are
  // newer. Keep the masthead stable as new places are inserted later.
  const first = Math.min(2023, ...years);
  const last = Math.max(...years);
  return first === last ? String(first) : `${first}—${last}`;
}

export default function LivingAtlasStory({
  stops,
  activeIndex,
  mobile,
  reducedMotion,
  paused,
  atlas,
  onOpen,
  onNavigate,
  chapterProgress,
}: Props) {
  const [railExpanded, setRailExpanded] = useState(false);
  const resolvedIndex = activeIndex >= 0 && activeIndex < stops.length ? activeIndex : 0;
  const sourceWidth = mobile ? 1100 : 1900;
  const fallbackProgress = useMotionValue(resolvedIndex);
  const progress = chapterProgress ?? fallbackProgress;
  const [visualIndex, setVisualIndex] = useState(() =>
    Math.round(clampChapter(chapterProgress?.get() ?? resolvedIndex, stops.length)),
  );
  const activeStop = stops[visualIndex];
  // Keep the small published archive mounted as one stable optical stack.
  // Only the two chapters adjacent to the fractional progress ever receive a
  // non-zero opacity, but mounting all six removes the one-frame empty state
  // that can otherwise occur when a trackpad fling skips several anchors
  // before React has rebuilt an adjacent-image window.
  const visualChapters = useMemo<VisualChapter[]>(() => stops.map((stop, index) => ({
    stop,
    index,
    src: imageUrl(stop.imageUrl, sourceWidth),
  })), [sourceWidth, stops]);
  const railLimit = mobile ? 3 : 4;
  const compactIndices = useMemo(
    () => chapterWindow(stops.length, visualIndex, railLimit),
    [railLimit, stops.length, visualIndex],
  );
  const compactIndexSet = useMemo(() => new Set(compactIndices), [compactIndices]);
  const compactStart = compactIndices[0] ?? 0;
  const railItemHeight = mobile ? 48 : 92;
  const railViewportHeight = Math.min(stops.length, railLimit) * railItemHeight;
  const hiddenCount = Math.max(0, stops.length - railLimit);
  const range = useMemo(() => yearRange(stops), [stops]);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const photoX = useSpring(pointerX, { stiffness: 76, damping: 24, mass: 0.72 });
  const photoY = useSpring(pointerY, { stiffness: 76, damping: 24, mass: 0.72 });

  useMotionValueEvent(progress, 'change', (value) => {
    const next = Math.round(clampChapter(value, stops.length));
    setVisualIndex((current) => current === next ? current : next);
  });

  useEffect(() => {
    if (chapterProgress) return;
    fallbackProgress.set(resolvedIndex);
    setVisualIndex(resolvedIndex);
  }, [chapterProgress, fallbackProgress, resolvedIndex]);

  // The normal path is completely scroll-scrubbed, so likely destinations must
  // already be decoded before they gain any opacity. Warm the visible trio
  // immediately, then finish the small six-image archive during an idle beat.
  useEffect(() => {
    const immediate = new Set([visualIndex - 1, visualIndex, visualIndex + 1]);
    stops.forEach((stop, index) => {
      if (!immediate.has(index)) return;
      const src = imageUrl(stop.imageUrl, sourceWidth);
      if (src) void decodeImage(src, index === visualIndex ? 'high' : 'low');
    });
    const idleTimer = window.setTimeout(() => {
      stops.forEach((stop, index) => {
        if (immediate.has(index)) return;
        const src = imageUrl(stop.imageUrl, sourceWidth);
        if (src) void decodeImage(src);
      });
    }, mobile ? 520 : 260);
    return () => window.clearTimeout(idleTimer);
  }, [mobile, sourceWidth, stops, visualIndex]);

  useEffect(() => {
    if (!paused) return;
    pointerX.set(0);
    pointerY.set(0);
  }, [paused, pointerX, pointerY]);

  if (!activeStop) return null;

  // Keep every chapter in the same right-hand photographic window. The map,
  // route and index remain readable on the left while the existing scrubbed
  // crossfade and pointer parallax continue inside this stable frame.
  const photoSide = 'right';
  const idPrefix = mobile ? 'mobile-archive-item-' : 'archive-item-';

  const scrollToChapter = (index: number) => {
    const stop = stops[index];
    if (!stop) return;
    if (index === visualIndex) {
      onOpen(stop);
      return;
    }
    setRailExpanded(false);
    onNavigate(`${idPrefix}${stop.id}`);
  };

  const followRoute = () => {
    const nextIndex = Math.min(stops.length - 1, visualIndex + 1);
    scrollToChapter(nextIndex);
  };
  const atLastStop = visualIndex === stops.length - 1;

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (mobile || reducedMotion || paused || event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    pointerX.set(x * 12);
    pointerY.set(y * 9);
  };

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  const renderCaptionContent = (chapter: VisualChapter, interactive: boolean) => {
    const countLabel = `${String(chapter.index + 1).padStart(2, '0')} / ${String(stops.length).padStart(2, '0')}`;
    return (
      <>
        <div className="mb-3 font-ui text-[8px] font-bold uppercase tracking-[0.32em] text-[#D2FF00]/82">
          <span>Chapter {String(chapter.index + 1).padStart(2, '0')}</span>
          <span className="sr-only">, {chapter.stop.frameCount} frames</span>
        </div>
        <button
          type="button"
          onClick={() => onOpen(chapter.stop)}
          tabIndex={interactive ? undefined : -1}
          data-cursor="Enter Story"
          className="group max-w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
          aria-label={`Open ${chapter.stop.name} story`}
        >
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 md:gap-x-4">
            <span className="living-atlas__title block font-serif uppercase leading-[0.8] tracking-[-0.06em] text-[#F4F4ED] transition-colors duration-300 group-hover:text-white">
              {chapter.stop.name}
            </span>
            <span className="living-atlas__slash font-serif text-[#D2FF00]/82" aria-hidden="true">/</span>
            <span className="font-serif text-[clamp(22px,2.8vw,42px)] tracking-[-0.04em] text-[#D2FF00]/78">
              {countLabel}
            </span>
          </span>
        </button>
      </>
    );
  };

  return (
    <section
      className="living-atlas relative isolate bg-[#171b15]"
      aria-label="Ryan Xu travel photographic documentary"
      data-photo-side={photoSide}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
    >
      <div className="living-atlas__stage sticky top-0 h-[100svh] min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0">{atlas}</div>

        <div className="living-atlas__entry-wash pointer-events-none absolute inset-x-0 top-0 z-10 h-[24svh]" aria-hidden="true" />

        <div className="living-atlas__running-head pointer-events-none absolute left-6 top-[5.15rem] z-30 md:left-12 md:top-[5.55rem]">
          <p className="font-ui text-[7px] font-medium uppercase tracking-[0.34em] text-white/54 md:text-[8px] md:tracking-[0.36em]">
            <span className="md:hidden">Travel archive&nbsp;&nbsp;/&nbsp;&nbsp;{range}</span>
            <span className="hidden md:inline">Travel photographic documentary&nbsp;&nbsp;/&nbsp;&nbsp;{range}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={followRoute}
          className="living-atlas__follow absolute left-1/2 top-[5.1rem] z-40 hidden min-h-11 -translate-x-1/2 items-center px-4 font-ui text-[8px] font-bold uppercase tracking-[0.38em] text-[#D2FF00]/78 transition-colors hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00] md:inline-flex"
        >
          {atLastStop ? 'Enter story ↘' : 'Follow the route ↓'}
        </button>

        <div
          className={`living-atlas__photo living-atlas__photo--${photoSide} pointer-events-none absolute z-10`}
          aria-hidden="true"
        >
          {visualChapters.map((chapter) => (
            <ScrubbedPhotoLayer
              key={visualChapterKey(chapter)}
              chapter={chapter}
              progress={progress}
              selected={chapter.index === visualIndex}
              reducedMotion={reducedMotion}
              photoX={photoX}
              photoY={photoY}
            />
          ))}
        </div>

        <div className="living-atlas__map-overprint pointer-events-none absolute inset-0 z-[11]" aria-hidden="true">
          <img
            src="/assets/maps/walkin-us-atlas.webp"
            alt=""
            className="h-full w-full object-fill"
            width="1600"
            height="956"
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </div>

        <nav
          className="living-atlas__rail absolute left-5 top-[27%] z-40 w-[9.5rem] md:left-12 md:top-[25%] md:w-[13rem]"
          aria-label="Documentary chapters"
        >
          <div
            className="overflow-hidden"
            style={railExpanded ? undefined : { height: railViewportHeight }}
          >
            <motion.ol
              id="living-atlas-chapter-list"
              {...(railExpanded ? { 'data-lenis-prevent': true } : {})}
              className={`living-atlas__rail-list relative ${railExpanded ? 'is-expanded' : ''}`}
              animate={{ y: railExpanded ? 0 : -compactStart * railItemHeight }}
              transition={reducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 190, damping: 29, mass: 0.76 }}
            >
            {stops.map((stop, index) => {
              const active = index === visualIndex;
              const passed = index < visualIndex;
              const inCompactWindow = compactIndexSet.has(index);
              return (
                <li
                  key={stop.id}
                  className="relative"
                  aria-hidden={!railExpanded && !inCompactWindow ? 'true' : undefined}
                >
                  <button
                    type="button"
                    onClick={() => scrollToChapter(index)}
                    tabIndex={!railExpanded && !inCompactWindow ? -1 : undefined}
                    aria-current={active ? 'step' : undefined}
                    aria-label={active ? `Open ${stop.name} story` : `Go to chapter ${index + 1}, ${stop.name}`}
                    className={`living-atlas__rail-item group relative flex min-h-11 w-full items-center gap-3 py-1 text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00] ${active ? 'is-active' : ''} ${passed ? 'is-passed' : ''}`}
                  >
                    <span className="living-atlas__rail-node relative z-10 h-2.5 w-2.5 shrink-0 rounded-full border border-white/24 bg-[#171b15] transition-colors duration-500" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-ui text-[8px] uppercase tracking-[0.24em] text-white/42 transition-colors duration-500 group-hover:text-white/68">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="mt-0.5 block truncate font-ui text-[10px] uppercase tracking-[0.24em] text-white/58 transition-colors duration-500 group-hover:text-white md:text-[11px]">
                        {stop.name}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            </motion.ol>
          </div>

          {stops.length > railLimit && (
            <button
              type="button"
              onClick={() => setRailExpanded((current) => !current)}
              className="mt-2 min-h-11 pl-[1.35rem] font-ui text-[8px] uppercase tracking-[0.27em] text-white/48 transition-colors hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
              aria-controls="living-atlas-chapter-list"
              aria-expanded={railExpanded}
            >
              {railExpanded ? 'Close index' : `+ ${hiddenCount} chapters`}
            </button>
          )}
        </nav>

        <div className="living-atlas__caption absolute bottom-[max(2.25rem,env(safe-area-inset-bottom))] left-5 right-5 z-40 md:bottom-12 md:left-[32%] md:right-[7%]">
          <div className="relative min-h-[6.5rem] md:min-h-[7.25rem]">
            {visualChapters.map((chapter) => (
              <ScrubbedCaptionLayer
                key={visualChapterKey(chapter)}
                chapter={chapter}
                progress={progress}
                selected={chapter.index === visualIndex}
                reducedMotion={reducedMotion}
              >
                {renderCaptionContent(chapter, chapter.index === visualIndex)}
              </ScrubbedCaptionLayer>
            ))}
          </div>
          <ScrubbedCoordinateReadout stops={stops} progress={progress} />
        </div>

        <p className="sr-only" aria-live="polite">
          Chapter {visualIndex + 1} of {stops.length}: {activeStop.name}
        </p>
      </div>

      <div className="living-atlas__scenes relative z-20 -mt-[100svh] pointer-events-none" aria-hidden="true">
        <div className="living-atlas__lead-in" />
        {stops.map((stop) => (
          <section
            key={stop.id}
            id={`${idPrefix}${stop.id}`}
            data-atlas-anchor
            className="living-atlas__scene relative"
          >
            <h3 className="sr-only">{stop.name}</h3>
          </section>
        ))}
        <div className="living-atlas__release" />
      </div>
    </section>
  );
}
