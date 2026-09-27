import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  animate,
  AnimatePresence,
  motion,
  type MotionValue,
  useIsPresent,
  useMotionValue,
  usePresenceData,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from 'framer-motion';
import type { RouteStop } from './RouteAtlas';
import { stockStyle } from '../../lib/ticketStock';
import { EASE } from '../../lib/motion';

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

// A chapter committed from the rail simply appears when the flight lands —
// no sweep wiping it in (页面下滑，封面部分是自动划出来的，我觉得没必要，直接出现就好:
// the desktop covers have no reveal either) — and the commit holds it this
// long while the flight settles onto its anchor, before the scrubbed
// crossfade takes the window back.
const COMMIT_HOLD_MS = 620;
// A committed flight that never lands (the visitor grabs the page mid-scroll,
// the anchor cannot be reached) must not leave the departure frame frozen on
// screen. Past this the commit is abandoned and the scrubbed crossfade resumes.
const COMMIT_LIMIT_MS = 2400;
// Close enough to the destination anchor to call it an arrival. `visualIndex`
// flips as the arriving photograph passes half up — still too early to show
// the photograph the flight is travelling towards.
const COMMIT_ARRIVAL_EPSILON = 0.18;

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

// Type cannot cross-dissolve at all: two superimposed city names read as
// neither ("MIAMI" over "ORLANDO", each with its own pager and coordinates).
// Fading them in turn was the first answer and it was never more than an
// absence — the place name simply stopped being one thing and started being
// another. So the names are one column inside a clip and the column ROLLS:
// scrolling forward sends the old name up and out while the new one rises from
// below, and scrolling back runs it in reverse. Direction is the sign of the
// scroll, not a state flag, so a fling rolls the names past as fast as the
// thumb moves and stops exactly where the thumb stops.
//
// The roll is not linear with the scroll, though. Each chapter owns ~92svh, so
// a column dragged straight off `progress` would be sliding at every scroll
// position and settled at almost none. It instead holds each name still and
// rolls across the one band where the chapter itself changes, spending the
// same scroll budget the old opacity ramp spent (0.08 either side).
//
// Where the chapter changes is where its PHOTOGRAPH takes over: the arriving
// frame half up, at 1 − PHOTO_ARRIVAL_BAND / 2 (0.825) of the gap, the same
// point the stub tears and `photoLeadIndex` flips. The band used to sit on the
// gap's midpoint, so one change ran on three clocks: the name had already
// rolled to ORLANDO while Miami's photograph and stub stayed on for another
// ~170px of scroll, and going back the order reversed. Now name, photograph
// and stub commit together.
const CAPTION_ROLL_BAND = 0.16;

function captionRoll(progress: number, total: number) {
  const clamped = clampChapter(progress, total);
  const index = Math.floor(clamped);
  const local = clamped - index;
  // (PHOTO_ARRIVAL_BAND is declared below; read at call time.)
  const start = 1 - PHOTO_ARRIVAL_BAND / 2 - CAPTION_ROLL_BAND / 2;
  const ramp = Math.max(0, Math.min(1, (local - start) / CAPTION_ROLL_BAND));
  return index + ramp * ramp * (3 - 2 * ramp);
}

function captionOffset(value: number, total: number) {
  if (total <= 1) return '0%';
  return `${(-value * 100) / total}%`;
}

// Photographs do dissolve, but not symmetrically. At full-bleed desktop size a
// 50/50 blend of two unrelated frames is not a dissolve — it reads as a double
// exposure. Any symmetric curve has that midpoint, so this one is one-sided:
// the chapter already reached stays fully opaque underneath, and the arriving
// one (later in the DOM, so painted over it) rises across the last stretch of
// its approach. One blend at a time, never a gap, never two ghosts.
const PHOTO_ARRIVAL_BAND = 0.35;

function photoChapterWeight(progress: number, index: number) {
  const delta = index - progress;
  if (Math.abs(delta) >= 1) return 0;
  if (delta <= 0) return 1;
  const ramp = Math.max(0, Math.min(1, (PHOTO_ARRIVAL_BAND - delta) / PHOTO_ARRIVAL_BAND));
  return ramp * ramp * (3 - 2 * ramp);
}

// The chapter whose photograph the window mostly shows: the arriving frame
// takes over once it is more than half up, halfway through its arrival band.
// This is the chapter's one commit point: `visualIndex` (the rail's highlight,
// the aria-live line, the caption's resting name) flips here too. It used to
// flip at the midpoint of the whole gap (±0.5), a good 0.15 of a chapter
// before the arriving frame had even begun to rise.
function photoLeadIndex(progress: number, total: number) {
  return Math.min(total - 1, Math.floor(clampChapter(progress, total) + PHOTO_ARRIVAL_BAND / 2));
}

// The chapter the phone's stub prints. Forward it follows the photograph
// (the arriving frame half up); back, it holds its chapter until that frame
// is mostly gone (a tenth of a chapter past the seam — the frame at ~10%),
// so a thumb resting on the seam cannot tear a stub and re-seat it over and
// over. Pure arithmetic on the progress; nothing is measured.
const STUB_BACK_SLACK = 0.1;
function stubLeadIndex(progress: number, total: number, current: number) {
  const forward = photoLeadIndex(progress, total);
  if (forward >= current) return forward;
  const back = Math.min(total - 1, Math.floor(clampChapter(progress, total) + PHOTO_ARRIVAL_BAND / 2 + STUB_BACK_SLACK));
  return Math.min(current, back);
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
  commitRole,
  shown,
}: {
  chapter: VisualChapter;
  progress: MotionValue<number>;
  selected: boolean;
  reducedMotion: boolean;
  photoX: MotionValue<number>;
  photoY: MotionValue<number>;
  /**
   * Set only while a chapter committed from the rail is in flight or arriving:
   * `from` is the frame the visitor is leaving, `to` the one arriving,
   * `other` every chapter the flight merely passes over.
   */
  commitRole: 'from' | 'to' | 'other' | null;
  /** The committed destination: 0 while the flight travels, 1 once landed. */
  shown: MotionValue<number>;
}) {
  const opacity = useTransform(progress, (value) => photoChapterWeight(value, chapter.index));

  // A rail tap is the one mobile gesture that IS a commit: a known destination
  // reached over a known duration. Scrubbing it would mean cross-fading every
  // chapter the flight passes over, so instead the departure frame holds, the
  // passed-over chapters stay down, and the destination is simply there on
  // arrival. The photograph is never zoomed on its way in or out either: only
  // its ink is scrubbed.
  const committed = !reducedMotion && commitRole !== null;
  const style = committed
    ? {
        opacity: commitRole === 'other' ? 0 : commitRole === 'to' ? shown : 1,
        zIndex: commitRole === 'to' ? 2 : 1,
        x: photoX,
        y: photoY,
      }
    : reducedMotion
      ? { opacity: selected ? 1 : 0 }
      : { opacity, x: photoX, y: photoY };

  return (
    <motion.div
      className="living-atlas__photo-layer absolute -inset-[3%]"
      style={style}
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
    <div className="mt-3 font-ui text-[8px] uppercase tracking-[0.1em] text-[#D2FF00]/70 md:text-[9px]">
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

// ── The ticket stub (phone) ──────────────────────────────────────────────
// The phone's photograph is one window that crossfades between chapters as
// the reader scrolls; it is not a card that can be torn. So the ticket here is
// the STUB: it hangs from the photograph's bottom edge on a perforation and
// prints the chapter's admission line, and every time the chapter commits the
// old stub is torn off and falls away with the new one already under it — a
// book of tickets being worked through, one per place. Time-based on the
// commit, never scrubbed. Going back, the stub simply re-seats.
const STUB_EXIT = [0.4, 0.14, 1, 1] as const;
// A press on a chapter title or a rail stop that travels this far (css px)
// before its click is a drag, not a click (ArchiveChapter's PULL_CLICK_SLOP).
const PRESS_CLICK_SLOP = 6;
// What a leaving stub hears from its AnimatePresence (framer resolves `exit`
// with this, not with the stub's own `custom`): the way it left, and how many
// forward tears the book has had so far.
type StubPresence = { direction: number; tears: number };
const stubVariants = {
  enter: (direction: number) => (direction > 0
    ? { y: 0, opacity: 1, rotate: 0 }
    : { y: 18, opacity: 0, rotate: 0 }),
  rest: { y: 0, opacity: 1, rotate: 0, transition: { duration: 0.42, ease: EASE.arrive } },
  // Forward: the pull (a hair up, under tension), then it gives and drops,
  // pivoting on its last attached corner. Back: it just steps aside.
  exit: (custom: StubPresence | number) => ((typeof custom === 'number' ? custom : custom.direction) > 0
    ? {
        y: [0, -1.5, 52],
        rotate: [0, 0.6, -6],
        opacity: [1, 1, 0],
        transition: {
          // The pull eases out (it gives); the drop eases in (it falls).
          // Gravity: a torn stub FALLS, it accelerates. The house expo
          // decelerates (84% of its travel in the first sixth of the time),
          // which on a fall and a fade-out meant the stub was gone before
          // anyone saw it drop: measured frame by frame, opacity 1.0 → 0.26
          // in 130ms. Falls and exits ease IN, on EASE.leave.
          y: { duration: 0.78, times: [0, 0.15, 1], ease: [EASE.arrive, EASE.leave] },
          rotate: { duration: 0.78, times: [0, 0.15, 1], ease: [EASE.arrive, EASE.leave] },
          // Whole for the first ~60% so the fall is SEEN, then it goes.
          opacity: { duration: 0.78, times: [0, 0.6, 1], ease: ['linear', EASE.leave] },
        },
      }
    : { y: 16, opacity: 0, transition: { duration: 0.26, ease: STUB_EXIT } }),
};

function StubFace({ stop, ordinal, total, direction, printIn }: { stop: RouteStop; ordinal: number; total: number; direction: number; printIn: boolean }) {
  const present = useIsPresent();
  // One stub falls at a time. A fling commits three chapters in ~450ms, and
  // three torn stubs used to fall at once, each for 780ms, rotating their own
  // ways over the perforation — a cascade of paper, not a tear. So when a
  // newer forward tear starts while this one is still falling, it is
  // overtaken: it steps aside on the back-exit's own numbers (16px, 0.26s,
  // eased in) from wherever its fall has got to. That is played on the `hold`
  // around it, not on the stub: framer never re-resolves a running exit (a
  // restarted one can strand the element), and the hold's fade multiplies
  // with the fall's. `tornAt` is the tear count at the render this stub
  // stopped being present, so its own tear never overtakes it.
  const presence = usePresenceData() as StubPresence | undefined;
  const tornAt = useRef<number | null>(null);
  if (present) tornAt.current = null;
  else if (tornAt.current === null) tornAt.current = presence?.tears ?? 0;
  const overtaken = !present && !!presence && tornAt.current !== null && presence.tears > tornAt.current;
  const holdRef = useRef<HTMLDivElement>(null);
  const stepped = useRef(false);
  // A layout effect, so the step aside starts in the same commit as the tear
  // that overtook it, not a painted frame later.
  useLayoutEffect(() => {
    const hold = holdRef.current;
    if (!hold) return undefined;
    if (overtaken) {
      stepped.current = true;
      const controls = animate(hold, { opacity: 0, y: 16 }, { duration: 0.26, ease: STUB_EXIT });
      return () => controls.stop();
    }
    // Present again (the reader came back to its chapter): whole at once, the
    // stub's own re-entry does the moving.
    if (present && stepped.current) {
      stepped.current = false;
      animate(hold, { opacity: 1, y: 0 }, { duration: 0 });
    }
    return undefined;
  }, [overtaken, present]);
  // Year first, frames last: on a narrow phone the line is cut with an
  // ellipsis, and it used to cut the year ("17 FRAMES · 20…").
  const facts = [
    stop.year != null ? String(stop.year) : null,
    stop.region,
    `${String(stop.frameCount).padStart(2, '0')} frames`,
  ].filter(Boolean).join(' · ');
  return (
    <div ref={holdRef} className="absolute inset-0">
    <motion.div
      /* A stub that arrives in place of a torn one is printed as it
         arrives (global.css `.is-printing`): fully printed from its first
         frame, "02 ORLANDO" read as overprint above the falling
         "01 MIAMI". The first stub on the page is simply there. */
      className={`living-ticket__stub${present ? '' : ' is-torn'}${printIn ? ' is-printing' : ''}`}
      /* Its own chapter's card: a torn stub keeps its stop, so it falls in
         its own colour while the next chapter's stock arrives under it. */
      style={{ zIndex: present ? 1 : 2, ...stockStyle(stop.slug) }}
      custom={direction}
      variants={stubVariants}
      initial="enter"
      animate="rest"
      exit="exit"
    >
      <span className="living-ticket__no font-serif">{String(ordinal).padStart(2, '0')}</span>
      <span className="living-ticket__text font-ui">
        <span className="living-ticket__place">{stop.name}</span>
        <span className="living-ticket__facts">
          / {String(total).padStart(2, '0')} · {facts}
        </span>
      </span>
    </motion.div>
    </div>
  );
}

function LivingTicketStub({ stops, index, reducedMotion }: {
  stops: RouteStop[];
  index: number;
  reducedMotion: boolean;
}) {
  const previous = useRef(index);
  const direction = index >= previous.current ? 1 : -1;
  useEffect(() => { previous.current = index; }, [index]);
  // Only stubs that replace another print themselves in.
  const firstIndex = useRef(index);
  const replaced = useRef(false);
  if (index !== firstIndex.current) replaced.current = true;
  // Forward tears so far, counted once per change of chapter. Leaving stubs
  // read it through AnimatePresence's `custom` (StubFace's `overtaken`).
  const tears = useRef(0);
  const counted = useRef(index);
  if (index !== counted.current) {
    if (index > counted.current) tears.current += 1;
    counted.current = index;
  }
  const stop = stops[index];
  if (!stop) return null;
  return (
    <div className="living-ticket pointer-events-none absolute z-[12]" aria-hidden="true">
      {reducedMotion ? (
        <StubFace stop={stop} ordinal={index + 1} total={stops.length} direction={1} printIn={false} />
      ) : (
        <AnimatePresence initial={false} custom={{ direction, tears: tears.current }}>
          <StubFace key={stop.id} stop={stop} ordinal={index + 1} total={stops.length} direction={direction} printIn={replaced.current} />
        </AnimatePresence>
      )}
    </div>
  );
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
    photoLeadIndex(chapterProgress?.get() ?? resolvedIndex, stops.length),
  );
  // The phone stub hangs from the photograph, so it changes with the
  // photograph, not with the chapter's type: each stub is printed on its own
  // chapter's colour, and one switched early put Orlando's blue under Miami's
  // frame for a few hundred pixels of scroll.
  const [photoIndex, setPhotoIndex] = useState(() =>
    photoLeadIndex(chapterProgress?.get() ?? resolvedIndex, stops.length),
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

  // A chapter chosen from the rail, from the moment it is tapped until its
  // photograph has been shown and held (COMMIT_HOLD_MS). `token` lets the
  // async arrival and the clean-up timers recognise their own commit after a
  // second tap replaced it.
  const [commit, setCommit] = useState<{ from: number; to: number; token: number; arrived: boolean } | null>(null);
  const commitTokenRef = useRef(0);
  const shown = useMotionValue(1);
  // Where a pointer pressed the chapter title or a rail stop: a press that
  // has travelled PRESS_CLICK_SLOP by its click is a drag (a long sideways
  // drag across the title opened the story), the same rule as the desktop
  // cover's click. A keyboard click (detail 0) never travelled.
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const notePress = (event: { clientX: number; clientY: number }) => {
    pressRef.current = { x: event.clientX, y: event.clientY };
  };
  const wasDrag = (event: { clientX: number; clientY: number; detail: number }) => {
    const press = pressRef.current;
    pressRef.current = null;
    return event.detail > 0 && !!press &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) >= PRESS_CLICK_SLOP;
  };

  const captionColumn = useTransform(progress, (value) =>
    captionOffset(captionRoll(value, stops.length), stops.length),
  );
  const captionSettled = captionOffset(visualIndex, stops.length);

  useMotionValueEvent(progress, 'change', (value) => {
    // The chapter commits where its photograph takes over (see photoLeadIndex).
    const next = photoLeadIndex(value, stops.length);
    setVisualIndex((current) => current === next ? current : next);
    setPhotoIndex((current) => {
      const lead = stubLeadIndex(value, stops.length, current);
      return current === lead ? current : lead;
    });
  });

  useEffect(() => {
    if (chapterProgress) return;
    fallbackProgress.set(resolvedIndex);
    setVisualIndex(resolvedIndex);
    setPhotoIndex(resolvedIndex);
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

  // Watch the committed flight in. The destination is shown once the scroll
  // is actually near its anchor AND the exact source the layer will paint has
  // been decoded — the frame then appears whole, at once, instead of in
  // whatever state the network left it.
  useMotionValueEvent(progress, 'change', (value) => {
    if (!commit || commit.arrived) return;
    if (Math.abs(value - commit.to) > COMMIT_ARRIVAL_EPSILON) return;
    const token = commit.token;
    setCommit((current) => (current && current.token === token ? { ...current, arrived: true } : current));
  });

  useEffect(() => {
    if (!commit) return;
    const { token, to, arrived } = commit;
    const clear = () => setCommit((current) => (current && current.token === token ? null : current));
    if (!arrived) {
      // Nothing has been shown yet while the flight is still travelling; the
      // limit only covers a flight that never lands at all.
      const limit = window.setTimeout(clear, COMMIT_LIMIT_MS);
      return () => window.clearTimeout(limit);
    }
    let cancelled = false;
    let timer = 0;
    const src = imageUrl(stops[to]?.imageUrl ?? '', sourceWidth);
    void decodeImage(src, 'high').then(() => {
      if (cancelled) return;
      shown.set(1);
      timer = window.setTimeout(clear, COMMIT_HOLD_MS + 90);
    });
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [commit, shown, sourceWidth, stops]);

  // Any real gesture during the flight hands the photograph back to the scroll.
  // The commit is a promise about a destination; once the visitor is steering,
  // holding the departure frame frozen would be a lie about where they are.
  useEffect(() => {
    if (!commit) return;
    const abandon = () => setCommit(null);
    const options = { passive: true } as const;
    window.addEventListener('wheel', abandon, options);
    window.addEventListener('touchstart', abandon, options);
    window.addEventListener('keydown', abandon);
    return () => {
      window.removeEventListener('wheel', abandon);
      window.removeEventListener('touchstart', abandon);
      window.removeEventListener('keydown', abandon);
    };
  }, [commit]);

  const commitRoleFor = (index: number): 'from' | 'to' | 'other' | null => {
    if (!commit) return null;
    if (index === commit.to) return 'to';
    if (index === commit.from) return 'from';
    return 'other';
  };

  if (!activeStop) return null;

  // Keep every chapter in the same right-hand photographic window. The map,
  // route and index remain readable on the left while the existing scrubbed
  // crossfade and pointer parallax continue inside this stable frame.
  // (`computeAtlasLayout` in src/lib/atlasLayout.ts derives an alternating
  // side from each stop's place on the route. It was wired up and rejected —
  // leave it unused.)
  const photoSide = 'right';
  const idPrefix = mobile ? 'mobile-archive-item-' : 'archive-item-';
  // The stub follows the frame on screen: under reduced motion the frame is
  // `visualIndex`'s; during a rail flight the departure frame holds until the
  // destination is shown; otherwise it is the scrubbed dissolve's lead frame
  // (held a little longer on the way back, `stubLeadIndex`).
  const stubIndex = reducedMotion
    ? visualIndex
    : commit
      ? (commit.arrived ? commit.to : commit.from)
      : photoIndex;

  const scrollToChapter = (index: number) => {
    const stop = stops[index];
    if (!stop) return;
    if (index === visualIndex) {
      onOpen(stop);
      return;
    }
    setRailExpanded(false);
    if (!reducedMotion) {
      commitTokenRef.current += 1;
      // Hold the destination back at the moment it is chosen, not at the moment
      // it lands: it starts hidden so the departure frame is the only one on
      // screen for the whole flight. Left shown, the destination appeared at
      // full strength the instant it was tapped and then again on arrival.
      shown.set(0);
      setCommit({ from: visualIndex, to: index, token: commitTokenRef.current, arrived: false });
      const src = imageUrl(stop.imageUrl, sourceWidth);
      if (src) void decodeImage(src, 'high');
    }
    onNavigate(`${idPrefix}${stop.id}`);
  };

  const followRoute = () => {
    const nextIndex = Math.min(stops.length - 1, visualIndex + 1);
    scrollToChapter(nextIndex);
  };
  const atLastStop = visualIndex === stops.length - 1;

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (mobile || reducedMotion || paused || event.pointerType === 'touch') return;
    // A pressed hand dragging across the window is not a hover: the photograph
    // holds still under it.
    if (event.buttons !== 0) return;
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
        <div className="mb-3 font-ui text-[8px] font-bold uppercase tracking-[0.1em] text-[#D2FF00]/82">
          <span>Chapter {String(chapter.index + 1).padStart(2, '0')}</span>
          <span className="sr-only">, {chapter.stop.frameCount} frames</span>
        </div>
        <button
          type="button"
          onPointerDown={notePress}
          onClick={(event) => {
            if (!wasDrag(event)) onOpen(chapter.stop);
          }}
          tabIndex={interactive ? undefined : -1}
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
        {/* `isolate` keeps the atlas's own stacking inside the atlas. Without a
            stacking context here its marker overlay (z-20) competed directly
            with the photographic window (z-10), so the route's place labels
            printed over the photograph. */}
        <div className="absolute inset-0 isolate z-0">{atlas}</div>

        <div className="living-atlas__entry-wash pointer-events-none absolute inset-x-0 top-0 z-10 h-[24svh]" aria-hidden="true" />

        <div className="living-atlas__running-head pointer-events-none absolute left-6 top-[5.15rem] z-30 md:left-12 md:top-[5.55rem]">
          <p className="font-ui text-[7px] font-medium uppercase tracking-[0.1em] text-white/54 md:text-[8px] md:tracking-[0.1em]">
            <span className="md:hidden">Travel archive&nbsp;&nbsp;/&nbsp;&nbsp;{range}</span>
            <span className="hidden md:inline">Travel photographic documentary&nbsp;&nbsp;/&nbsp;&nbsp;{range}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={followRoute}
          className="living-atlas__follow absolute left-1/2 top-[5.1rem] z-40 hidden min-h-11 -translate-x-1/2 items-center px-4 font-ui text-[8px] font-bold uppercase tracking-[0.1em] text-[#D2FF00]/78 transition-colors hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00] md:inline-flex"
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
              commitRole={commitRoleFor(chapter.index)}
              shown={shown}
            />
          ))}
        </div>

        {mobile && <LivingTicketStub stops={stops} index={stubIndex} reducedMotion={reducedMotion} />}

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
                    onPointerDown={notePress}
                    onClick={(event) => {
                      if (!wasDrag(event)) scrollToChapter(index);
                    }}
                    tabIndex={!railExpanded && !inCompactWindow ? -1 : undefined}
                    aria-current={active ? 'step' : undefined}
                    aria-label={active ? `Open ${stop.name} story` : `Go to chapter ${index + 1}, ${stop.name}`}
                    className={`living-atlas__rail-item group relative flex min-h-11 w-full items-center gap-3 py-1 text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00] ${active ? 'is-active' : ''} ${passed ? 'is-passed' : ''}`}
                  >
                    <span className="living-atlas__rail-node relative z-10 h-2.5 w-2.5 shrink-0 rounded-full border border-white/24 bg-[#171b15] transition-colors duration-500" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-ui text-[8px] uppercase tracking-[0.1em] text-white/58 transition-colors duration-500 group-hover:text-white/68">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="mt-0.5 block truncate font-ui text-[10px] uppercase tracking-[0.1em] text-white/58 transition-colors duration-500 group-hover:text-white md:text-[11px]">
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
              className="mt-2 min-h-11 pl-[1.35rem] font-ui text-[8px] uppercase tracking-[0.1em] text-white/48 transition-colors hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
              aria-controls="living-atlas-chapter-list"
              aria-expanded={railExpanded}
            >
              {railExpanded ? 'Close index' : `+ ${hiddenCount} chapters`}
            </button>
          )}
        </nav>

        <div className="living-atlas__caption absolute bottom-[max(2.25rem,env(safe-area-inset-bottom))] left-5 right-5 z-40 md:bottom-12 md:left-[32%] md:right-[7%]">
          <div className="living-atlas__caption-window relative overflow-hidden">
            <motion.div
              className="living-atlas__caption-column"
              style={{ y: reducedMotion ? captionSettled : captionColumn }}
            >
              {visualChapters.map((chapter) => {
                const current = chapter.index === visualIndex;
                return (
                  <div
                    key={visualChapterKey(chapter)}
                    className={`living-atlas__caption-cell ${current ? '' : 'pointer-events-none'}`}
                    aria-hidden={current ? undefined : 'true'}
                  >
                    {renderCaptionContent(chapter, current)}
                  </div>
                );
              })}
            </motion.div>
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
