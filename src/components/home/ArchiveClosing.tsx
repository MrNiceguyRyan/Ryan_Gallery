import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { animate, motion, useReducedMotion, useTransform } from 'framer-motion';
import { useSectionScroll } from '../../lib/useSectionScroll';
import type { Collection } from '../../types';
import {
  LOOSE,
  LOUPE,
  PAGE_BOUNDS,
  PANEL_BOUNDS,
  PROOF,
  SCORE,
  anchorSrc,
  anchorWidth,
  copyBox,
  frameSrc,
  loupePlace,
  loupeWidth,
  pad2,
  placeCopy,
  proofChapters,
  proofHit,
  proofLayout,
  proofScore,
  proofTally,
  proofZoom,
  ringPath,
  routeDashes,
  stubPaper,
  yearSpan,
  type ProofChapter,
  type ProofLayout,
  type ProofMetrics,
  type ProofRect,
  type ProofScore,
  type ProofZoom,
  type RouteDash,
} from '../../lib/proofSheet';
import { stockPaper, stockStyle } from '../../lib/ticketStock';
import { CSS_EASE } from '../../lib/motion';
import { Bi, T, useLang } from '../../i18n/react';
import { tr, type Key } from '../../i18n/dict';
import { getLang, type Lang } from '../../i18n/lang';

// Fraunces' widest digit: `0` is 1420/2000 upm. It ships without tnum, so a
// figure set in it changes width on every tick (`1` is 0.47em) and drags the
// word after it sideways. Per-digit slots were tried and read as "0 6" at
// display size, so instead the whole figure sits in a box measured by an
// invisible copy of its FINAL value: the digits keep their natural fit and
// kerning, and the word after the figure never moves because the box never
// does. The final value is the widest state on these lines (counts only go up
// from 00), so nothing overflows mid-count.

/**
 * A count that ticks up in visible steps (Joffrey Spitzer's steps(14)), once,
 * when the closing page arrives. The server renders the final figure; the
 * visual count is aria-hidden and the real value stays in the accessible text.
 */
export function StepCount({ value, pad, run }: { value: number; pad: number; run: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  // Zero-padded to `pad`, but never fewer characters than the final figure needs.
  const digits = Math.max(pad, String(value).length);
  const finalText = String(value).padStart(digits, '0');

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const write = (n: number) => {
      const text = String(Math.round(n)).padStart(digits, '0');
      if (node.textContent !== text) node.textContent = text;
    };
    if (reduce) {
      write(value);
      return;
    }
    if (!run) {
      write(0);
      return;
    }
    const steps = Math.max(1, Math.min(14, value));
    const controls = animate(0, value, {
      duration: 1.1,
      ease: (t: number) => Math.floor(t * steps) / steps,
      onUpdate: write,
    });
    return () => controls.stop();
  }, [digits, reduce, run, value]);

  // The invisible copy of the final value is the in-flow content, so the box
  // (and its baseline) come from the same glyphs the count ends on; the live
  // count is laid over it from the left edge. Both render the final figure on
  // the server, so hydration is byte-stable.
  return (
    <>
      <span aria-hidden="true" className="relative inline-block">
        <span className="invisible">{finalText}</span>
        <span ref={ref} className="absolute inset-y-0 left-0">{finalText}</span>
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}

// ── The ending ───────────────────────────────────────────────────────────────
// The archive's Index (the explorer's contact sheet, opened over the map,
// HomePage): it opens on the last place's cover, sharp, at 80% of the height,
// captioned — and the camera pulls back at once, in one unbroken move, until
// that frame is one cell of an editor's proof sheet of the whole archive. As
// the sheet settles the kept stubs are dealt onto the heads of their rows,
// each row admitting its frames one tick at a time; the editor's china marker
// rings the covers, the atlas's route threads them, and the frames not chosen
// step back. Geometry and score: lib/proofSheet. Styles: global.css, "The
// closing". The resting sheet is the natural state of this markup; the client
// ARMS the pre-play state (`data-ending` on the section) and removes it when
// the ending settles, so nothing hidden is ever server-rendered.

// The closing ARRIVES (it is never scrubbed): its top within 2% of the
// viewport's top. Arrived, the ending waits for the page to come to a stop
// (ARRIVE_STILL_PX between two frames, or all the way in, or ARRIVE_STILL_MS
// at most) so the camera pulls back from a still frame, not one the glide is
// still carrying up. Leaving before it starts re-arms it.
const ARRIVE = 0.98;
const ARRIVE_FULL = 0.999;
const ARRIVE_STILL_PX = 0.5;
const ARRIVE_STILL_MS = 300;
const LEAVE_WAITING = 0.9;
// The ending runs on its own clock, not the scroll's, so a reader who backs up
// a little while it plays lets it finish in view. Only once the sheet is
// mostly off screen does it jump to rest, where the jump goes unseen.
const LEAVE_PLAYING = 0.35;
// Start fetching the sheet's files about two chapters ahead.
const PREPARE_AT = -2.5;
// A change of more than half a page in one frame is a jump (a restored
// scroll, a deep link, Back to the start under reduced motion): shown, never
// played.
const JUMP = 0.5;
// At the arrival, wait this long at most for the sheet's files to decode.
const DECODE_WAIT_MS = 600;

// The house curves come from src/lib/motion.ts (CSS_EASE): arrive for what
// lands, leave for falls and fade-outs (they ease IN), travel for the card
// squaring up. The three below are the closing's own named exceptions - see
// src/lib/motion.ts.
// Paper skidding on a table: friction stops it.
const SKID = 'cubic-bezier(0.2, 0.8, 0.3, 1)';
const PEN = 'cubic-bezier(0.45, 0.05, 0.4, 1)';
const STEP_BACK = 'cubic-bezier(0.4, 0, 0.2, 1)';

/** The title, set line by line in each language (closing.titleLines: the
 *  lines are split on " / "; Chinese has two). */
const TITLE_LINES: Record<Lang, string[]> = {
  en: tr('en', 'closing.titleLines').split(' / '),
  zh: tr('zh', 'closing.titleLines').split(' / '),
};
// The tally's strokes, from the same constants the layout sizes the stub by.
const TALLY_VARS = {
  '--tick-w': `${PROOF.TICK_W}px`,
  '--tick-h': `${PROOF.TICK_H}px`,
  '--tick-gap': `${PROOF.TICK_GAP}px`,
  '--tick-group-gap': `${PROOF.TICK_GROUP_GAP}px`,
} as CSSProperties;

interface Geo {
  layout: ProofLayout;
  zoom: ProofZoom;
  score: ProofScore;
  copy: { x: number; y: number; w: number; titleSize: number };
  rings: string[];
  dashes: RouteDash[];
  papers: Array<{ paper: string; photo: string }>;
  srcs: string[];
  /** The width of the file each frame shows at rest (Sanity `w`). */
  rasterW: number[];
  wedgeSrcs: string[];
  anchorIndex: number;
  /** The copy block's box on the sheet: the loupe steps off it. */
  copyRect: ProofRect;
}

/** What the sheet asks of the page when a frame or a stub is chosen. */
export interface ClosingStoryRequest {
  /** The frame to open once the story is up (its bare asset URL); none opens
   *  the story at its front page. */
  frameUrl?: string;
  /** Where focus goes back to when the story closes: the row's stub when it
   *  was pressed from the keyboard, else the closing section (no ring). */
  returnFocus?: HTMLElement | null;
  /** The frame that was chosen, on screen (its figure): the story's cover
   *  grows out of that picture, as it grows out of a homepage plate. */
  source?: HTMLElement;
}

interface Props {
  /** The issue's chapters, in the homepage's reading order (HomePage's
   *  `orderedCities`): the same list the ticket stubs are printed from. */
  collections: Collection[];
  /** Back to the start: the entrance's opening words, a new pass (HomePage).
   *  The page's links line only. */
  onBackToStart?: () => void;
  /** Open a chapter's story from the sheet (HomePage owns the overlay). */
  onOpenStory?: (collectionId: string, request: ClosingStoryRequest) => void;
  /** Where the sheet is set. 'page': the closing's own screen, its ending
   *  played on arrival. 'panel': the contact sheet of the explorer's places
   *  panel (ExplorerControls, 2026-09-30) — the sheet at rest from its first
   *  frame (the panel's own paper opens round it), set in the panel's room
   *  (lib/proofSheet PANEL_BOUNDS), no kicker and no links; where the sheet
   *  cannot be set (the phone, a narrow window) the rolls flow down it
   *  instead (FlowSheet). */
  frame?: 'page' | 'panel';
}

/** Untransformed document offset, as the homepage timeline measures it. */
function documentTop(node: HTMLElement | null) {
  let top = 0;
  let current: HTMLElement | null = node;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return top;
}

const stubSub = (chapter: ProofChapter, lang: Lang = 'en') => {
  // A region that only repeats the place (New York, New York) is left off —
  // compared in English, printed in the language asked for.
  const same = !chapter.region || chapter.region.toLowerCase() === chapter.place.toLowerCase();
  const region = same ? '' : lang === 'zh' && chapter.regionZh ? chapter.regionZh : chapter.region;
  return [region, chapter.year].filter(Boolean).join(' · ');
};
const placeOf = (chapter: ProofChapter, lang: Lang) => (lang === 'zh' && chapter.placeZh) || chapter.place;
/** The stub's place and sub, both languages in the markup. */
const StubPlace = ({ chapter }: { chapter: ProofChapter }) => <Bi en={chapter.place} zh={chapter.placeZh} />;
const StubSub = ({ chapter }: { chapter: ProofChapter }) => <Bi en={stubSub(chapter, 'en')} zh={stubSub(chapter, 'zh')} />;
const stubAria = (chapter: ProofChapter, total: number, lang: Lang) =>
  tr(lang, 'closing.stubAria', { place: placeOf(chapter, lang), n: chapter.ordinal, total: pad2(total), frames: chapter.frames.length });

// Fraunces' optical size widens its figures as they get smaller, so the
// ruler sets them near the size they are used at (26–38px), not at a size
// that would read them narrow.
const RULER_SIZE = 36;
// The tally's count is set at 14–20px: measured there, not at 36.
const COUNT_RULER_SIZE = 18;

/** Type, measured once in its own faces, from the hidden ruler. */
function readMetrics(ruler: HTMLElement): ProofMetrics {
  const widths = (selector: string) => Array.from(ruler.querySelectorAll<HTMLElement>(selector)).map((node) => node.offsetWidth);
  return {
    ordinalEm: Math.max(0, ...widths('[data-ruler="ordinal"]')) / RULER_SIZE,
    metaW: Math.max(0, ...widths('[data-ruler="meta"]')),
    figureEm: widths('[data-ruler="figure"]').map((width) => width / RULER_SIZE),
    figureLabelW: widths('[data-ruler="label"]'),
    countEm: Math.max(0, ...widths('[data-ruler="count"]')) / COUNT_RULER_SIZE,
  };
}

/** The title's size at which its widest line fills the measure (Fraunces'
 *  optical size changes its width with its size, so it is set and re-read). */
function fitTitle(ruler: HTMLElement, measure: number) {
  const title = ruler.querySelector<HTMLElement>('[data-ruler="title"]');
  if (!title) return PROOF.TITLE_MAX;
  const lines = Array.from(title.children) as HTMLElement[];
  let size: number = PROOF.TITLE_MAX;
  for (let turn = 0; turn < 4; turn += 1) {
    title.style.fontSize = `${size}px`;
    const widest = Math.max(1, ...lines.map((line) => line.offsetWidth));
    const next = Math.min(PROOF.TITLE_MAX, Math.floor(size * (measure / widest) * 0.985));
    if (next === size) break;
    size = next;
  }
  return size;
}

export default function ArchiveClosing({ collections, onBackToStart, onOpenStory, frame = 'page' }: Props) {
  const reduce = useReducedMotion();
  const panel = frame === 'panel';
  const chapters = useMemo(() => proofChapters(collections), [collections]);
  const total = useMemo(() => chapters.reduce((sum, chapter) => sum + chapter.frames.length, 0), [chapters]);
  const years = useMemo(() => yearSpan(chapters.map((chapter) => chapter.year)), [chapters]);
  // Each figure's label is a dictionary key (also its React key).
  const figures = useMemo<Array<{ label: Key; value: string }>>(() => [
    { label: 'closing.fig.chapters', value: pad2(chapters.length) },
    { label: 'closing.fig.frames', value: pad2(total) },
    ...(years ? [{ label: 'closing.fig.years' as Key, value: years }] : []),
  ], [chapters.length, total, years]);
  const lang = useLang();

  const sectionRef = useRef<HTMLElement>(null);
  const proofRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [prepared, setPrepared] = useState(false);
  // The page's story opener, current on every render; the sheet's hands are
  // built once per layout and ask for it only when a frame is chosen.
  const openStoryRef = useRef(onOpenStory);
  openStoryRef.current = onOpenStory;

  // The page's own closing scrolls into view (its lip, its counter-move); the
  // places panel's sheet does not scroll with the page, and tracking it there
  // measured the sheet on every frame of the entrance's glide
  // (src/lib/useSectionScroll.ts).
  const scrollYProgress = useSectionScroll(sectionRef, ['start end', 'end end'], !panel);
  const lipScale = useTransform(scrollYProgress, [0, 0.62], [1, 0], { clamp: true });
  // The counter-move: the closing lies still underneath while the last
  // chapter lifts off it (darkroom.engineering's revealed footer).
  const stageY = useTransform(scrollYProgress, [0, 1], ['-58%', '0%'], { clamp: true });

  // ── Geometry: one pure layout of the section's own size ─────────────────
  const geoKeyRef = useRef('');
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const ruler = rulerRef.current;
    if (!section || !ruler || !chapters.length) return;
    const measure = (force = false) => {
      const W = section.clientWidth;
      const H = section.clientHeight;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const metrics = readMetrics(ruler);
      const key = `${W}x${H}@${dpr}:${metrics.ordinalEm.toFixed(3)},${metrics.metaW},${metrics.countEm.toFixed(3)},${metrics.figureEm.map((em) => em.toFixed(3)).join(',')}`;
      if (!force && key === geoKeyRef.current) return;
      geoKeyRef.current = key;
      const layout = proofLayout(W, H, chapters, metrics, panel ? PANEL_BOUNDS : PAGE_BOUNDS);
      if (!layout) {
        setGeo(null);
        return;
      }
      const copy = placeCopy(layout, fitTitle(ruler, layout.copyW));
      const zoom = proofZoom(layout, dpr);
      const covers = layout.frames.filter((frame) => frame.isCover);
      const route = routeDashes(covers);
      const score = proofScore(layout, route);
      const anchorIndex = layout.frames.indexOf(zoom.anchor);
      const anchorNeed = (frame: ProofLayout['frames'][number], index: number) => frame.w * Math.max(zoom.frames[index].kmax * dpr, 2);
      setGeo({
        layout,
        zoom,
        score,
        copy,
        rings: covers.map((frame, index) => ringPath(frame, 11 + index * 7)),
        dashes: route.dashes,
        papers: layout.stubs.map((stub, index) => stubPaper(stub, index)),
        srcs: layout.frames.map((frame, index) => (index === anchorIndex
          ? anchorSrc(frame.url, anchorNeed(frame, index))
          : frameSrc(frame.url, zoom.frames[index].srcW))),
        rasterW: layout.frames.map((frame, index) => (index === anchorIndex
          ? anchorWidth(anchorNeed(frame, index))
          : zoom.frames[index].srcW)),
        wedgeSrcs: chapters.map((chapter) => `${chapter.coverUrl}?h=${Math.ceil((layout.SH * 2) / 16) * 16}&auto=format&q=80`),
        anchorIndex,
        copyRect: copyBox(layout, copy),
      });
    };
    measure(true);
    let disposed = false;
    document.fonts?.ready.then(() => {
      if (!disposed) measure();
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    observer?.observe(section);
    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, [chapters, panel]);

  // ── The ending's state, kept outside React: nothing re-renders per frame ─
  type Phase = 'armed' | 'waiting' | 'playing' | 'rest';
  const phaseRef = useRef<Phase | null>(null);
  const engineRef = useRef<ReturnType<typeof createEnding> | null>(null);
  const decodedRef = useRef<Promise<unknown> | null>(null);
  const pendingRef = useRef(0);

  // A new layout: build the score for it and show the state the ending is in.
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const proof = proofRef.current;
    const copy = copyRef.current;
    if (!geo || !section || !proof || !copy) {
      // No sheet at this size (the quiet ending): nothing to arm or play.
      engineRef.current = null;
      if (phaseRef.current === 'waiting' || phaseRef.current === 'playing') {
        pendingRef.current += 1;
        phaseRef.current = 'rest';
      }
      return;
    }
    // The sheet's hands (loupe, rows, frames that open their stories) work
    // only on the settled sheet: the ending turns them on at rest and off
    // whenever it arms or plays.
    const hands = createHands({ section, proof, loupe: loupeRef.current }, geo, chapters, {
      reduce: !!reduce,
      open: (chapter, frameUrl, returnFocus, source) => {
        openStoryRef.current?.(chapter.id, { frameUrl: frameUrl ?? undefined, returnFocus, source: source ?? undefined });
      },
    });
    const engine = createEnding({ section, proof, copy }, geo, chapters, !!reduce, () => {
      phaseRef.current = 'rest';
    }, hands.setLive);
    engineRef.current = engine;
    if (phaseRef.current === null) {
      // First layout. A closing already on (or past) the screen was reached
      // by a jump — a restored scroll, a deep link — and is shown at rest;
      // the panel's sheet is always at rest.
      const p = (window.scrollY + window.innerHeight - documentTop(section)) / Math.max(1, section.offsetHeight);
      phaseRef.current = panel || p > 0 ? 'rest' : 'armed';
    } else if (phaseRef.current !== 'armed') {
      // A resize mid-play (or while waiting) jumps to the rest state.
      pendingRef.current += 1;
      phaseRef.current = 'rest';
    }
    if (phaseRef.current === 'armed') engine.arm();
    else engine.rest();
    return () => {
      engine.dispose();
      hands.dispose();
    };
  }, [geo, chapters, reduce, panel]);

  // Decode the sheet before the camera needs it.
  useEffect(() => {
    const proof = proofRef.current;
    if (!prepared || !geo || !proof) return;
    const images = Array.from(proof.querySelectorAll<HTMLImageElement>('.proof__frame img'));
    const wedges = geo.wedgeSrcs.map((src) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      return image;
    });
    decodedRef.current = Promise.allSettled(
      images.map((image) => image.decode()).concat(wedges.map((image) => image.decode())),
    );
  }, [prepared, geo]);

  // ── The trigger ─────────────────────────────────────────────────────────
  // Read with offsets measured once per layout change — no rect per frame:
  // start the ending when the sheet has arrived (opened over the map it is
  // there at once, and plays as it opens).
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    // The panel's sheet is never played: its files are wanted at once.
    if (panel) {
      setPrepared(true);
      return;
    }
    let sectionTop = 0;
    let sectionH = 1;
    let viewH = 1;
    let lastP: number | null = null;
    let preparedOnce = false;
    // The arrival's wait for a still page (see ARRIVE): one rAF watch, 0 when
    // none runs.
    let stillFrame = 0;
    const stopStill = () => {
      if (stillFrame) cancelAnimationFrame(stillFrame);
      stillFrame = 0;
    };
    const measure = () => {
      viewH = window.innerHeight;
      sectionTop = documentTop(section);
      sectionH = Math.max(1, section.offsetHeight);
    };
    const begin = () => {
      const engine = engineRef.current;
      if (!engine) return;
      phaseRef.current = 'waiting';
      const token = ++pendingRef.current;
      const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const decoded = decodedRef.current ?? wait(DECODE_WAIT_MS);
      void Promise.race([decoded, wait(DECODE_WAIT_MS)]).then(() => {
        if (token !== pendingRef.current || phaseRef.current !== 'waiting') return;
        const current = engineRef.current;
        if (!current) return;
        phaseRef.current = 'playing';
        current.play();
      });
    };
    const toRest = () => {
      stopStill();
      pendingRef.current += 1;
      phaseRef.current = 'rest';
      engineRef.current?.rest();
    };
    // Arrived: begin once the page moves less than ARRIVE_STILL_PX a frame, or
    // is all the way in, or after ARRIVE_STILL_MS whatever the page is doing.
    // The speed is read over two frames: the page lands on whole pixels, so
    // a glide slower than a pixel a frame still has frames that do not move.
    // A reader who backs off first ends the watch; the next arrival starts a
    // new one.
    const awaitStill = () => {
      if (stillFrame) return;
      const since = performance.now();
      const seen: number[] = [];
      const step = (now: number) => {
        stillFrame = 0;
        if (phaseRef.current !== 'armed') return;
        const y = window.scrollY;
        const p = (y + viewH - sectionTop) / sectionH;
        if (p < ARRIVE) return;
        const still = seen.length === 2 && Math.abs(y - seen[0]) < 2 * ARRIVE_STILL_PX;
        if (still || p >= ARRIVE_FULL || now - since >= ARRIVE_STILL_MS) {
          begin();
          return;
        }
        seen.push(y);
        if (seen.length > 2) seen.shift();
        stillFrame = requestAnimationFrame(step);
      };
      stillFrame = requestAnimationFrame(step);
    };
    const sample = () => {
      const y = window.scrollY;
      const p = (y + viewH - sectionTop) / sectionH;
      const jump = lastP != null && Math.abs(p - lastP) > JUMP;
      lastP = p;

      if (!preparedOnce && p > PREPARE_AT) {
        preparedOnce = true;
        setPrepared(true);
      }

      const phase = phaseRef.current;
      if (phase === 'armed') {
        if (jump && p > 0) toRest();
        else if (p >= ARRIVE) awaitStill();
      } else if (phase === 'waiting') {
        if (p < LEAVE_WAITING) {
          pendingRef.current += 1;
          phaseRef.current = 'armed';
        }
      } else if (phase === 'playing') {
        if (p < LEAVE_PLAYING) toRest();
      }
    };
    const remeasure = () => {
      measure();
      sample();
    };
    measure();
    sample();
    const onVisibility = () => {
      if (document.hidden && (phaseRef.current === 'playing' || phaseRef.current === 'waiting')) toRest();
    };
    // Keyboard focus reaching the links (or the kept stubs) before the ending
    // has played shows the finished page: nothing focusable stays invisible.
    const copy = copyRef.current;
    const proof = proofRef.current;
    const onFocus = () => {
      if (phaseRef.current === 'armed' || phaseRef.current === 'waiting') toRest();
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);
    observer?.observe(document.body);
    window.addEventListener('scroll', sample, { passive: true });
    window.addEventListener('resize', remeasure, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    copy?.addEventListener('focusin', onFocus);
    proof?.addEventListener('focusin', onFocus);
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', sample);
      window.removeEventListener('resize', remeasure);
      document.removeEventListener('visibilitychange', onVisibility);
      copy?.removeEventListener('focusin', onFocus);
      proof?.removeEventListener('focusin', onFocus);
      stopStill();
      pendingRef.current += 1;
    };
  }, [reduce, panel]);

  const layout = geo?.layout;
  const zoom = geo?.zoom;
  const anchorChapter = geo ? chapters[geo.layout.frames[geo.anchorIndex].row] : null;
  const dropOrder = (row: number) => (layout ? layout.stubs.length - 1 - row : 0);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="archive-closing-title"
      // Where focus lands when a story opened from the sheet by a pointer
      // closes: the closing itself, focused by script, never tabbed to.
      tabIndex={-1}
      data-archive-closing=""
      data-frame={frame}
      className={panel
        ? 'archive-closing archive-closing--panel relative z-0 h-full overflow-hidden text-[#F4F4ED]'
        : 'archive-closing relative z-0 h-[100svh] min-h-[600px] overflow-hidden bg-[#20241a] text-[#F4F4ED]'}
    >
      {/* The bottom edge of the page above: page-coloured, curved, flattening.
          Hidden by CSS, not by branching on `reduce`, so server and client
          render the same tree under reduced motion. The panel has no page
          above it. */}
      {!panel && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[16svh] origin-top bg-[#282c20] motion-reduce:hidden"
          style={{ scaleY: lipScale, borderRadius: '0 0 50% 50% / 0 0 100% 100%' }}
        />
      )}

      <motion.div
        className="absolute inset-0 flex flex-col justify-center"
        style={reduce || panel ? undefined : { y: stageY }}
      >
        {/* The panel's sheet where the proof cannot be set: the rolls flow
            down the panel, one after another. */}
        {panel && !geo && (
          <FlowSheet chapters={chapters} onOpen={(chapter, request) => openStoryRef.current?.(chapter.id, request)} />
        )}
        {/* The copy: the real heading, figures and links. Server-rendered in
            flow with its final values; placed into the sheet's empty room
            once the client has the layout. Under the proof, so a stub in the
            air passes over the kicker the way paper passes over print — all
            but the title, which rises over the last frames as they clear its
            room (global.css), so no passing photograph ever clips a word. */}
        <div
          ref={copyRef}
          className={geo ? 'closing-copy is-placed' : 'closing-copy safe-inline-page mx-auto w-full max-w-6xl'}
          style={geo ? { left: geo.copy.x, top: geo.copy.y, width: geo.copy.w } : undefined}
          hidden={panel && !geo}
        >
          {!panel && (
            <p
              className="closing-kicker font-ui"
              style={geo && layout ? { left: layout.kicker.x - geo.copy.x, top: layout.kicker.y - geo.copy.y } : undefined}
            >
              <span className="closing-kicker__lead" aria-hidden="true">
                <span className="closing-kicker__dot" />
                <span className="closing-kicker__count">{pad2(chapters.length)} / {pad2(chapters.length)}</span>
              </span>
              <span className="sr-only"><T k="closing.sr.count" vars={{ n: chapters.length }} /></span>
              <span className="closing-kicker__rule" aria-hidden="true" />
              <span className="closing-kicker__done"><T k="closing.done" /></span>
              <span className="closing-kicker__rest"><T k="closing.everyFrame" vars={{ total: pad2(total) }} /></span>
            </p>
          )}

          <h2
            id="archive-closing-title"
            className="closing-title font-serif"
            style={geo ? { fontSize: geo.copy.titleSize } : undefined}
          >
            <span className="sr-only"><T k="closing.title" /></span>
            {(['en', 'zh'] as const).flatMap((l) =>
              TITLE_LINES[l].map((line) => (
                <span key={`${l}-${line}`} className="closing-title__line" aria-hidden="true" data-l={l} lang={l === 'zh' ? 'zh-Hans' : undefined}>
                  <span>{line}</span>
                </span>
              )),
            )}
          </h2>

          <dl
            className="closing-figs"
            style={geo && layout ? { columnGap: layout.figureGap, ['--closing-fig' as never]: `${layout.figureSize}px` } : undefined}
          >
            {figures.map((figure) => (
              <div key={figure.label} className="closing-fig">
                <dt className="closing-fig__label font-ui"><T k={figure.label} /></dt>
                <dd className="closing-fig__value font-serif">
                  <span aria-hidden="true" className="closing-fig__box">
                    <span className="invisible">{figure.value}</span>
                    <span className="closing-fig__live">{figure.value}</span>
                  </span>
                  <span className="sr-only">{figure.value}</span>
                </dd>
              </div>
            ))}
          </dl>

          {!panel && (
            <div className="closing-links font-ui">
              <button
                type="button"
                onClick={onBackToStart}
                className="inline-flex min-h-11 items-center uppercase text-[#D2FF00]/85 transition-colors hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
              >
                <T k="closing.backToStart" />
              </button>
              <a
                href="/about"
                className="inline-flex min-h-11 items-center text-white/72 transition-colors hover:text-[#F4F4ED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
              >
                <T k="closing.about" />
              </a>
              <a
                href="/travel"
                className="inline-flex min-h-11 items-center text-white/72 transition-colors hover:text-[#F4F4ED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
              >
                <T k="closing.map" />
              </a>
            </div>
          )}
        </div>

        {/* The proof sheet: every frame, the kept stubs, the editor's marks.
            The frames and marks are decorative (everything on them is in the
            copy or the chapters); the kept stubs are the sheet's controls —
            each opens its chapter's story, as a torn ticket's stub does. */}
        <div ref={proofRef} className="proof" style={TALLY_VARS}>
          {geo && layout && zoom && (
            <>
              {layout.frames.map((frame, index) => (
                <figure
                  key={frame.n}
                  aria-hidden="true"
                  data-index={index}
                  className={`proof__frame${frame.isCover ? ' is-cover' : ''}${index === geo.anchorIndex ? ' is-anchor' : ''}`}
                  style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
                >
                  <img
                    alt=""
                    decoding="async"
                    fetchPriority="low"
                    draggable={false}
                    src={prepared ? geo.srcs[index] : undefined}
                  />
                </figure>
              ))}

              <svg className="proof-marks" aria-hidden="true" width={layout.W} height={layout.H} viewBox={`0 0 ${layout.W} ${layout.H}`}>
                {geo.dashes.map((dash, index) => (
                  <path key={`route-${index}`} className="proof-route" d={dash.d} />
                ))}
                {geo.rings.map((d, index) => (
                  <path key={`ring-${index}`} className="proof-ring" d={d} pathLength={1} />
                ))}
              </svg>

              {layout.frames.map((frame) => (
                <span
                  key={frame.n}
                  aria-hidden="true"
                  className={`proof-num font-ui${frame.isCover ? ' is-cover' : ''}`}
                  style={{ left: frame.x, top: frame.y + frame.h + PROOF.NUM_TOP }}
                >
                  {pad2(frame.n)}
                </span>
              ))}

              {layout.stubs.map((stub, row) => {
                const chapter = chapters[row];
                const paper = geo.papers[row];
                const imageW = Math.round(stub.h * chapter.coverRatio);
                const id = `proof-stub-${row}`;
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    data-row={row}
                    className="proof-stub"
                    aria-label={stubAria(chapter, chapters.length, lang)}
                    style={{
                      left: stub.x,
                      top: stub.y,
                      width: stub.w,
                      height: stub.h,
                      zIndex: 10 + dropOrder(row),
                      ...stockStyle(chapter.slug),
                    }}
                  >
                    <span className="proof-stub__shadow" />
                    <span className="proof-stub__card">
                      <svg width={stub.w} height={stub.h} viewBox={`0 0 ${stub.w} ${stub.h}`}>
                        <defs>
                          <clipPath id={`${id}-paper`}>
                            <path clipRule="evenodd" d={paper.paper} />
                          </clipPath>
                          <clipPath id={`${id}-photo`}>
                            <path d={paper.photo} />
                          </clipPath>
                          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#F4F4ED" stopOpacity={0.06} />
                            <stop offset="0.5" stopColor="#F4F4ED" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <g clipPath={`url(#${id}-paper)`}>
                          {/* The paper's white core, where the tear exposed it. */}
                          <rect x={0} y={0} width={stub.seam} height={stub.h} fill="#d9d6c7" />
                          {/* A wedge of the chapter's own cover: its right edge, which met the perforation. */}
                          <g clipPath={`url(#${id}-photo)`}>
                            <image
                              href={prepared ? geo.wedgeSrcs[row] : undefined}
                              x={stub.seam - imageW}
                              y={0}
                              width={imageW}
                              height={stub.h}
                              preserveAspectRatio="xMaxYMid slice"
                            />
                          </g>
                          {/* The card: the chapter's own stock, as its ticket was printed. */}
                          <rect x={stub.seam} y={0} width={stub.w - stub.seam} height={stub.h} fill={stockPaper(chapter.slug)} />
                          <rect x={stub.seam} y={0} width={stub.w - stub.seam} height={stub.h} fill={`url(#${id}-sheen)`} />
                          <rect x={stub.seam} y={0} width={1} height={stub.h} fill="#F4F4ED" fillOpacity={0.1} />
                        </g>
                      </svg>
                      <span
                        className="proof-stub__print"
                        style={{ left: stub.seam + PROOF.PRINT_PAD, right: PROOF.PRINT_RIGHT, height: layout.h }}
                      >
                        <span className="proof-stub__no font-serif" style={{ fontSize: stub.ordinalSize }}>
                          {chapter.ordinal}
                        </span>
                        <span className="proof-stub__meta font-ui">
                          <span className="proof-stub__place"><StubPlace chapter={chapter} /></span>
                          <span className="proof-stub__sub"><StubSub chapter={chapter} /></span>
                        </span>
                      </span>
                      {/* One tick per frame, in fives, on the frame numbers'
                          own baseline — the stub's tally runs straight on
                          into its row — and the count, a figure in the
                          ordinal's face, in a ledger column at the edge. Each
                          sits in a line box set like the numbers' (global.css),
                          so all three share one baseline without a measure. */}
                      <span
                        className="proof-stub__tally font-ui"
                        style={{ left: stub.seam + PROOF.PRINT_PAD, right: PROOF.PRINT_RIGHT, top: stub.tallyTop }}
                      >
                        <span className="proof-stub__line">
                          <span className="proof-stub__ticks">
                            {chapter.frames.map((_, k) => (
                              <i key={k} className={k > 0 && k % PROOF.TICK_GROUP === 0 ? 'is-group' : undefined} />
                            ))}
                          </span>
                        </span>
                        <span className="proof-stub__line">
                          <b className="proof-stub__count font-serif" style={{ fontSize: stub.countSize }}>
                            {pad2(chapter.frames.length)}
                          </b>
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}

              {anchorChapter && (
                <p className="proof-caption font-ui" aria-hidden="true" style={{ left: zoom.caption.x, top: zoom.caption.y }}>
                  <T k="closing.loupe" vars={{ nn: pad2(layout.frames[geo.anchorIndex].n), total: pad2(total) }} />
                  <em>
                    <Bi
                      en={` · ${[anchorChapter.place, anchorChapter.year].filter(Boolean).join(' · ')}`}
                      zh={anchorChapter.placeZh ? ` · ${[anchorChapter.placeZh, anchorChapter.year].filter(Boolean).join(' · ')}` : null}
                    />
                  </em>
                </p>
              )}
            </>
          )}

          {/* The ruler: the stub's and the copy's type, set once in their own
              faces so the layout can be derived from widths it never reads
              again. Never visible. */}
          <div ref={rulerRef} className="proof-ruler" aria-hidden="true">
            {chapters.map((chapter) => (
              <span key={`o-${chapter.id}`} data-ruler="ordinal" className="proof-stub__no font-serif" style={{ fontSize: RULER_SIZE }}>
                {chapter.ordinal}
              </span>
            ))}
            {/* Both languages, plainly (no data-l: neither is hidden), so
                the sheet is laid out for the wider of the two and a toggle
                never overflows it. */}
            {chapters.map((chapter) => (
              <span key={`p-${chapter.id}`} data-ruler="meta" className="proof-stub__place font-ui">{chapter.place}</span>
            ))}
            {chapters.map((chapter) => chapter.placeZh ? (
              <span key={`pz-${chapter.id}`} data-ruler="meta" lang="zh-Hans" className="proof-stub__place font-ui">{chapter.placeZh}</span>
            ) : null)}
            {chapters.map((chapter) => (
              <span key={`s-${chapter.id}`} data-ruler="meta" className="proof-stub__sub font-ui">{stubSub(chapter)}</span>
            ))}
            {chapters.map((chapter) => (
              <span key={`sz-${chapter.id}`} data-ruler="meta" lang="zh-Hans" className="proof-stub__sub font-ui">{stubSub(chapter, 'zh')}</span>
            ))}
            {chapters.map((chapter) => (
              <span key={`c-${chapter.id}`} data-ruler="count" className="proof-stub__count font-serif" style={{ fontSize: COUNT_RULER_SIZE }}>
                {pad2(chapter.frames.length)}
              </span>
            ))}
            {figures.map((figure) => (
              <span key={`f-${figure.label}`} data-ruler="figure" className="closing-fig__value font-serif" style={{ fontSize: RULER_SIZE }}>
                {figure.value}
              </span>
            ))}
            {figures.map((figure) => (
              <span key={`l-${figure.label}`} data-ruler="label" className="closing-fig__label font-ui">{tr('en', figure.label)}</span>
            ))}
            <span data-ruler="title" className="closing-title font-serif">
              {TITLE_LINES.en.map((line) => <span key={`en-${line}`}>{line}</span>)}
              {TITLE_LINES.zh.map((line) => <span key={`zh-${line}`} lang="zh-Hans">{line}</span>)}
            </span>
          </div>
        </div>

        {/* The editor's loupe: a lens over the settled sheet that magnifies
            what is under the pointer, drawn from the layout (the frames at a
            sharper file once the pointer rests), with the frame's number and
            place under it. Pointer-only; the client moves it. */}
        {geo && (
          <div ref={loupeRef} className="proof-loupe" aria-hidden="true">
            <span className="proof-loupe__lens">
              <canvas />
            </span>
            <p className="proof-loupe__caption font-ui">
              <span className="proof-loupe__no" />
              <em className="proof-loupe__place" />
            </p>
          </div>
        )}
      </motion.div>
    </section>
  );
}

// ── The rolls, flowing (the panel where the proof cannot be set) ───────────
// The phone's contact sheet, and a desktop window too narrow for the proof:
// one roll per place, in route order, down the panel — its stub on the
// place's own card stock (ordinal, place, region · year, the count), then
// its frames at their own ratios in justified lines, the cover ringed. A
// stub opens the story (the keyboard's way in, as on the proof); a frame
// opens it at that frame, the story growing out of it. The frames are
// decorative to a screen reader (everything on them is in the stubs).

const FLOW_H = 58;

export function FlowSheet({ chapters, onOpen }: {
  chapters: readonly ProofChapter[];
  onOpen: (chapter: ProofChapter, request: ClosingStoryRequest) => void;
}) {
  const lang = useLang();
  const dpr = typeof window === 'undefined' ? 2 : Math.min(3, window.devicePixelRatio || 1);
  const fileW = (ratio: number) => Math.min(640, Math.ceil((FLOW_H * ratio * dpr) / 80) * 80);
  return (
    <div className="flow-sheet" data-lenis-prevent>
      {chapters.map((chapter) => (
        <section key={chapter.id} className="flow-roll" aria-label={`${chapter.ordinal} ${placeOf(chapter, lang)}`}>
          <button
            type="button"
            className="flow-stub"
            style={stockStyle(chapter.slug)}
            aria-label={stubAria(chapter, chapters.length, lang)}
            onClick={(event) => onOpen(chapter, {
              returnFocus: event.detail === 0 ? event.currentTarget : event.currentTarget.closest<HTMLElement>('[data-archive-closing]'),
            })}
          >
            <span className="flow-stub__no font-serif">{chapter.ordinal}</span>
            <span className="flow-stub__meta font-ui">
              <span className="flow-stub__place"><StubPlace chapter={chapter} /></span>
              <span className="flow-stub__sub"><StubSub chapter={chapter} /></span>
            </span>
            <b className="flow-stub__count font-serif">{pad2(chapter.frames.length)}</b>
          </button>
          <div className="flow-frames" aria-hidden="true">
            {chapter.frames.map((frame, k) => (
              <figure
                key={`${frame.url}-${k}`}
                className={`flow-frame${frame.isCover ? ' is-cover' : ''}`}
                style={{ flexGrow: frame.ratio, flexBasis: Math.round(FLOW_H * frame.ratio) }}
                onClick={(event) => onOpen(chapter, {
                  frameUrl: frame.url,
                  returnFocus: event.currentTarget.closest<HTMLElement>('[data-archive-closing]'),
                  source: event.currentTarget,
                })}
              >
                <img alt="" loading="lazy" decoding="async" draggable={false} src={frameSrc(frame.url, fileW(frame.ratio))} />
              </figure>
            ))}
            <i className="flow-frames__rest" />
          </div>
        </section>
      ))}
    </div>
  );
}

// ── The score, played ────────────────────────────────────────────────────────
// WAAPI through the DOM the component rendered: compositor-only (transform and
// opacity) except the six rings' dashoffset and the route's dashes, every
// keyframe precomputed, no React state per frame. The only per-frame JS is the
// tally: the figures are the sum of what has landed.

interface EndingParts {
  section: HTMLElement;
  proof: HTMLElement;
  copy: HTMLElement;
}

function createEnding(
  parts: EndingParts,
  geo: Geo,
  chapters: readonly ProofChapter[],
  reduce: boolean,
  onRest: () => void,
  onLive: (live: boolean) => void,
) {
  const { section, proof, copy } = parts;
  const { layout, zoom, score } = geo;
  const all = <T extends Element>(root: ParentNode, selector: string) => Array.from(root.querySelectorAll<T>(selector));
  const frames = all<HTMLElement>(proof, '.proof__frame');
  const images = all<HTMLImageElement>(proof, '.proof__frame img');
  const numbers = all<HTMLElement>(proof, '.proof-num');
  const stubs = all<HTMLElement>(proof, '.proof-stub');
  const cards = stubs.map((stub) => stub.querySelector<HTMLElement>('.proof-stub__card')!);
  const shadows = stubs.map((stub) => stub.querySelector<HTMLElement>('.proof-stub__shadow')!);
  const ticks = stubs.map((stub) => all<HTMLElement>(stub, '.proof-stub__ticks i'));
  const counts = stubs.map((stub) => stub.querySelector<HTMLElement>('.proof-stub__count')!);
  const rings = all<SVGPathElement>(proof, '.proof-ring');
  const dashes = all<SVGPathElement>(proof, '.proof-route');
  const marks = proof.querySelector<SVGSVGElement>('.proof-marks');
  const caption = proof.querySelector<HTMLElement>('.proof-caption');
  const kickerLead = copy.querySelector<HTMLElement>('.closing-kicker__lead');
  const kickerCount = copy.querySelector<HTMLElement>('.closing-kicker__count');
  const kickerRule = copy.querySelector<HTMLElement>('.closing-kicker__rule');
  const kickerDone = copy.querySelector<HTMLElement>('.closing-kicker__done');
  const kickerRest = copy.querySelector<HTMLElement>('.closing-kicker__rest');
  const titleLines = all<HTMLElement>(copy, '.closing-title__line > span');
  const figureBlock = copy.querySelector<HTMLElement>('.closing-figs');
  const live = all<HTMLElement>(copy, '.closing-fig__live');
  const links = copy.querySelector<HTMLElement>('.closing-links');
  const root = document.documentElement;
  const n = chapters.length;
  const totalFrames = layout.frames.length;
  const allYears = yearSpan(chapters.map((chapter) => chapter.year));

  let animations: Animation[] = [];
  let raf = 0;
  let navTimer = 0;
  let disposed = false;

  const write = (node: HTMLElement | null | undefined, text: string) => {
    if (node && node.textContent !== text) node.textContent = text;
  };
  const tally = (ms: number | null) => {
    const t = ms == null
      ? { chapters: n, frames: totalFrames, years: allYears }
      : proofTally(score, chapters, ms);
    write(live[0], pad2(t.chapters));
    write(live[1], pad2(t.frames));
    write(live[2], t.years || '—');
    write(kickerCount, `${pad2(t.chapters)} / ${pad2(n)}`);
  };
  const add = (node: Element | null | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    if (!node) return null;
    const animation = node.animate(keyframes, { fill: 'both', ...options });
    animations.push(animation);
    return animation;
  };
  const clearTransforms = () => {
    frames.forEach((frame) => { frame.style.transform = ''; });
  };
  const quietNav = () => {
    window.clearTimeout(navTimer);
    root.dataset.closingQuiet = 'out';
  };
  const returnNav = () => {
    if (!root.dataset.closingQuiet) return;
    root.dataset.closingQuiet = 'return';
    window.clearTimeout(navTimer);
    navTimer = window.setTimeout(() => { delete root.dataset.closingQuiet; }, SCORE.navIn);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    const running = animations;
    animations = [];
    running.forEach((animation) => animation.cancel());
  };

  /** The pre-play state: frame 58 as it is first seen, the rest waiting. */
  const arm = () => {
    stop();
    onLive(false);
    section.dataset.ending = reduce ? 'still' : 'armed';
    if (!reduce) frames.forEach((frame, index) => { frame.style.transform = zoom.frames[index].transforms[0]; });
    tally(reduce ? null : 0);
  };

  /** Cancel everything and write the final state: the markup's own. */
  const rest = () => {
    stop();
    clearTransforms();
    delete section.dataset.ending;
    tally(null);
    returnNav();
    // The settled sheet can be handled.
    onLive(true);
  };

  const settle = () => {
    if (disposed) return;
    rest();
    onRest();
  };

  const play = () => {
    stop();
    onLive(false);
    // The clock every event is read from: an effect-less animation started in
    // the same frame as the rest, so the tally can never drift from them.
    const clock = section.animate([], { duration: reduce ? SCORE.reducedMarks + SCORE.reducedFade : score.end });
    animations.push(clock);
    void clock.finished.then(settle, () => {});

    if (reduce) {
      // Values, not structure: the same tree and the same order — each stub
      // with its row, then the editor's marks — as short fades. Nothing
      // travels, rotates, scales or rises; the figures are whole already.
      layout.stubs.forEach((_, row) => {
        const delay = row * SCORE.reducedRow;
        const fade = { duration: SCORE.reducedFade, delay, easing: 'linear' };
        add(stubs[row], [{ opacity: 0 }, { opacity: 1 }], fade);
        layout.frames.forEach((frame, index) => {
          if (frame.row !== row) return;
          add(frames[index], [{ opacity: 0 }, { opacity: 1 }], fade);
          add(numbers[index], [{ opacity: 0 }, { opacity: 1 }], fade);
        });
      });
      add(marks, [{ opacity: 0 }, { opacity: 1 }], { duration: SCORE.reducedFade, delay: SCORE.reducedMarks, easing: 'linear' });
      return;
    }

    quietNav();
    const offsets = zoom.offsets;
    const along = (transforms: string[]) => transforms.map((transform, j) => ({ transform, offset: offsets[j] }));

    // 1 · The pull-back: one log-space curve, sampled, linear between samples.
    const pullBack = frames.map((frame, index) => add(frame, along(zoom.frames[index].transforms), { duration: SCORE.zoom, easing: 'linear' }));
    add(caption, [{ opacity: 1 }, { opacity: 0 }], { duration: SCORE.capOut, easing: CSS_EASE.leave, fill: 'forwards' });
    // Text never scales: the stubs and the numbers RIDE the sheet by
    // translate, glued to the heads and feet of their rows.
    const rides = [
      ...stubs.map((stub, row) => add(stub, along(zoom.ride(layout.x0, row, 0)), { duration: SCORE.zoom, easing: 'linear' })),
      ...numbers.map((number, index) => {
        const frame = layout.frames[index];
        return add(number, along(zoom.ride(frame.x, frame.row, frame.h)), { duration: SCORE.zoom, easing: 'linear' });
      }),
    ];
    // Landed: drop the camera so every frame re-rasters at 1x.
    void pullBack[0]?.finished.then(() => {
      if (disposed) return;
      const landed = new Set(pullBack.concat(rides));
      clearTransforms();
      landed.forEach((animation) => animation?.cancel());
      animations = animations.filter((running) => !landed.has(running));
    }, () => {});

    // 2 · The kept stubs, dealt from the top of the pile: the one just torn
    // first. Height is the shadow's (far, faint, wide → tight, dark); the
    // paper itself only falls, turns and skids — never scales.
    layout.stubs.forEach((_, row) => {
      const loose = LOOSE[row % LOOSE.length];
      const dir = loose.r < 0 ? -1 : 1;
      const delay = score.dropAt[row];
      const duration = score.square + SCORE.squareMs - delay;
      const oHit = SCORE.fall / duration;
      const oLoose = (SCORE.fall + SCORE.skid) / duration;
      const oSquare = (score.square - delay) / duration;
      const pose = (p: { x: number; y: number; r: number }) => `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg)`;
      const from = { x: loose.x + dir * 16, y: loose.y - 44, r: loose.r + dir * 6 };
      const hit = { x: loose.x - dir * 7, y: loose.y + 2, r: loose.r - dir * 1.1 };
      add(cards[row], [
        { transform: pose(from), offset: 0, easing: CSS_EASE.leave },
        { transform: pose(hit), offset: oHit, easing: SKID },
        { transform: pose(loose), offset: oLoose, easing: 'linear' },
        { transform: pose(loose), offset: oSquare, easing: CSS_EASE.travel },
        { transform: 'translate(0px, 0px) rotate(0deg)', offset: 1 },
      ], { duration, delay });
      add(cards[row], [{ opacity: 0 }, { opacity: 1 }], { duration: SCORE.fall * 0.38, delay, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' });
      add(shadows[row], [
        { transform: 'translate(30px, 52px) scale(1.18)', opacity: 0.04, offset: 0, easing: CSS_EASE.leave },
        { transform: 'translate(0px, 5px) scale(1)', opacity: 0.8, offset: oHit, easing: SKID },
        { transform: 'translate(0px, 6px) scale(1)', opacity: 0.72, offset: oLoose, easing: 'linear' },
        { transform: 'translate(0px, 6px) scale(1)', opacity: 0.72, offset: oSquare, easing: CSS_EASE.travel },
        { transform: 'translate(0px, 3px) scale(1)', opacity: 0.5, offset: 1 },
      ], { duration, delay });
      // The row answers its stub: one tick punched per frame, and that frame
      // admitted — brightened, its number lit — left to right in step.
      const rowTicks = score.tickAt[row];
      add(counts[row], [{ opacity: 0 }, { opacity: 1 }], { duration: SCORE.light, delay: rowTicks[rowTicks.length - 1] + SCORE.tickStep, easing: 'linear' });
    });
    layout.frames.forEach((frame, index) => {
      const at = score.tickAt[frame.row][frame.k];
      add(ticks[frame.row][frame.k], [
        { transform: 'scaleY(0)', opacity: 0.2 },
        { transform: 'scaleY(1)', opacity: 1 },
      ], { duration: 240, delay: at, easing: CSS_EASE.arrive });
      add(numbers[index], [{ opacity: 0 }, { opacity: 1 }], { duration: SCORE.light, delay: at, easing: 'linear' });
      // The face that came off is already the reader's: it never dims.
      if (index !== geo.anchorIndex) {
        add(frames[index], [{ opacity: 0.55 }, { opacity: 1 }], { duration: SCORE.light, delay: at, easing: 'linear' });
      }
    });

    // 3 · The copy fills the room as the sheet lands: the kicker counts the
    // stubs down, the figures sum what has landed, the line rises.
    add(kickerLead, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: SCORE.kicker, easing: 'linear' });
    add(kickerRule, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 480, delay: score.kickerRule, easing: CSS_EASE.arrive });
    add(kickerDone, [
      { opacity: 0, transform: 'translateX(-6px)' },
      { opacity: 1, transform: 'translateX(0px)' },
    ], { duration: 560, delay: score.kickerDone, easing: CSS_EASE.arrive });
    add(kickerRest, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: score.kickerRest, easing: 'ease-out' });
    add(figureBlock, [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0px)' },
    ], { duration: 700, delay: SCORE.figures, easing: CSS_EASE.arrive });
    titleLines.forEach((line, index) => {
      add(line, [{ transform: 'translateY(125%)' }, { transform: 'translateY(0%)' }], {
        duration: SCORE.titleMs,
        delay: SCORE.title + index * SCORE.titleStep,
        easing: CSS_EASE.arrive,
      });
    });
    add(links, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: SCORE.links, easing: 'ease-out' });

    // 4 · The editor's hand: the covers ringed in chapter order, the route
    // threading them behind the rings, the frames not chosen stepping back.
    rings.forEach((ring, index) => {
      add(ring, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: SCORE.ringMs, delay: score.ringAt[index], easing: PEN });
    });
    dashes.forEach((dash, index) => {
      add(dash, [{ opacity: 0 }, { opacity: 0.8 }], { duration: SCORE.dash, delay: score.dashAt[index], easing: 'linear' });
    });
    layout.frames.forEach((frame, index) => {
      if (frame.isCover) return;
      // After the admission, never before it: no backwards fill.
      add(images[index], [{ opacity: 1 }, { opacity: 0.7 }], { duration: SCORE.dimMs, delay: score.dim, easing: STEP_BACK, fill: 'forwards' });
    });

    // The tally: a chapter per stub down, a frame per tick punched.
    const tick = () => {
      if (disposed || clock.playState !== 'running') return;
      tally(Number(clock.currentTime ?? 0));
      raf = requestAnimationFrame(tick);
    };
    tally(0);
    raf = requestAnimationFrame(tick);
  };

  // Leaves the markup at rest: a layout change re-arms it in the same pass
  // (nothing paints in between), and a sheet that goes away — a resize down
  // to the quiet ending, an unmount — must not leave the copy armed.
  const dispose = () => {
    disposed = true;
    stop();
    onLive(false);
    clearTransforms();
    delete section.dataset.ending;
    tally(null);
    window.clearTimeout(navTimer);
    delete root.dataset.closingQuiet;
  };

  return { arm, rest, play, dispose };
}

// ── The editor's hands ───────────────────────────────────────────────────────
// Once the sheet has settled it can be handled: a loupe over the frames, a
// kept stub that brings its row forward, a frame that opens its story. All of
// it is off until the ending rests (`setLive`), and none of it re-renders
// React: classes on the sheet's own nodes, one lens moved by transform, one
// canvas redrawn while the lens moves. The pointer is turned into sheet
// coordinates with one rect read per gesture; everything under it is found
// in the layout's own rects (lib/proofSheet `proofHit`).

interface HandsParts {
  section: HTMLElement;
  proof: HTMLElement;
  loupe: HTMLElement | null;
}

interface HandsOptions {
  reduce: boolean;
  open: (chapter: ProofChapter, frameUrl: string | null, returnFocus: HTMLElement | null, source?: HTMLElement | null) => void;
}

const GROUND = '#20241a';
const FRAME_GROUND = '#0f120c';
const INK = '#f4f4ed';

function createHands(parts: HandsParts, geo: Geo, chapters: readonly ProofChapter[], options: HandsOptions) {
  const { section, proof, loupe } = parts;
  const { layout } = geo;
  const all = <T extends Element>(selector: string) => Array.from(proof.querySelectorAll<T>(selector));
  const frames = all<HTMLElement>('.proof__frame');
  const images = frames.map((frame) => frame.querySelector('img'));
  const numbers = all<HTMLElement>('.proof-num');
  const stubs = all<HTMLElement>('.proof-stub');
  const rings = all<SVGPathElement>('.proof-ring');
  const dashes = all<SVGPathElement>('.proof-route');
  const total = layout.frames.length;
  let disposed = false;
  let live = false;
  let liveFrame = 0;

  // ── A row brought forward: hovering its stub, or keyboard focus on it ──
  // Its frames, numbers, stub, ring and the route's legs into and out of its
  // cover; everything else steps back (global.css, `.has-lit`).
  const rowParts: Element[][] = layout.stubs.map((_, row) => [
    ...frames.filter((_, index) => layout.frames[index]?.row === row),
    ...numbers.filter((_, index) => layout.frames[index]?.row === row),
    stubs[row],
    rings[row],
    ...dashes.filter((_, index) => geo.dashes[index]?.leg === row - 1 || geo.dashes[index]?.leg === row),
  ].filter((node): node is Element => !!node));
  let hoverRow: number | null = null;
  let focusRow: number | null = null;
  let litRow: number | null = null;
  const light = () => {
    const next = live ? hoverRow ?? focusRow : null;
    if (next === litRow) return;
    if (litRow != null) rowParts[litRow]?.forEach((node) => node.classList.remove('is-lit'));
    litRow = next;
    if (next != null) rowParts[next]?.forEach((node) => node.classList.add('is-lit'));
    proof.classList.toggle('has-lit', next != null);
  };
  const rowOf = (node: EventTarget | null) => {
    const row = Number((node as HTMLElement | null)?.dataset?.row);
    return Number.isInteger(row) && row >= 0 && row < layout.stubs.length ? row : null;
  };
  const onStubEnter = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    hoverRow = rowOf(event.currentTarget);
    light();
  };
  const onStubLeave = () => {
    hoverRow = null;
    light();
  };
  const onStubFocus = (event: FocusEvent) => {
    const stub = event.currentTarget as HTMLElement;
    let visible = true;
    try {
      visible = stub.matches(':focus-visible');
    } catch {
      // No :focus-visible: every focus shows.
    }
    focusRow = visible ? rowOf(stub) : null;
    light();
  };
  const onStubBlur = () => {
    focusRow = null;
    light();
  };

  // ── The loupe ──
  const fine = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const canvas = loupe?.querySelector('canvas') ?? null;
  const ctx = canvas?.getContext('2d') ?? null;
  const loupeOn = !options.reduce && fine && !!loupe && !!ctx;
  const captionNo = loupe?.querySelector<HTMLElement>('.proof-loupe__no') ?? null;
  const captionPlace = loupe?.querySelector<HTMLElement>('.proof-loupe__place') ?? null;
  const D = LOUPE.D;
  const R = D / 2;
  const Z = LOUPE.ZOOM;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (canvas) {
    canvas.width = Math.round(D * dpr);
    canvas.height = Math.round(D * dpr);
  }
  const rootStyle = getComputedStyle(document.documentElement);
  const fontUi = rootStyle.getPropertyValue('--font-ui').trim() || 'sans-serif';
  const fontSerif = rootStyle.getPropertyValue('--font-display').trim() || 'serif';
  const ringPaths = typeof Path2D === 'undefined' ? [] : geo.rings.map((d) => new Path2D(d));
  const routePath = typeof Path2D === 'undefined' || !geo.dashes.length ? null : new Path2D(geo.dashes.map((dash) => dash.d).join(' '));
  const labels = layout.frames.map((frame) => pad2(frame.n));
  const counts = chapters.map((chapter) => pad2(chapter.frames.length));
  // Type metrics, once, at the first draw (by then the faces are in): a
  // label's width for its halo, and where the numbers' 9px line box puts its
  // baseline (the tally's count shares it). The sheet's tracking, where the
  // canvas can set it.
  const tracks = !!ctx && 'letterSpacing' in ctx;
  const track = (value: string) => {
    if (tracks && ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
  };
  let labelW: number[] | null = null;
  let numBase = 7.5;
  const typeMetrics = (context: CanvasRenderingContext2D) => {
    context.font = `9px ${fontUi}`;
    track('0.54px');
    const widths = labels.map((label) => context.measureText(label).width + (tracks ? 0 : label.length * 0.54));
    const metrics = context.measureText('0');
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent > 0) numBase = (9 - (ascent + descent)) / 2 + ascent;
    return widths;
  };
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  // The sharper files, fetched on intent and kept (a few dozen at most).
  const sharp = new Map<number, HTMLImageElement>();
  const asked = new Set<number>();
  const want = (index: number) => {
    const frame = layout.frames[index];
    if (!frame || asked.has(index)) return;
    asked.add(index);
    const width = loupeWidth(frame, dpr);
    // The file on the sheet is already sharp enough under the lens.
    if (width <= (geo.rasterW[index] ?? 0)) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = frameSrc(frame.url, width);
    image.decode().then(() => {
      if (disposed) return;
      sharp.set(index, image);
      while (sharp.size > 36) {
        const oldest = sharp.keys().next().value;
        if (oldest === undefined) break;
        sharp.delete(oldest);
        asked.delete(oldest);
      }
      if (shown) kick();
    }, () => {
      // Unreachable file: the sheet's own raster stays under the lens.
    });
  };

  let ox = 0;
  let oy = 0;
  let stale = true;
  let px = 0;
  let py = 0;
  let fx = 0;
  let fy = 0;
  let shown = false;
  let focal = -1;
  let below = true;
  let raf = 0;
  let last = 0;
  let graceTimer = 0;
  let intentTimer = 0;
  let neighbourTimer = 0;

  const drawCover = (context: CanvasRenderingContext2D, image: HTMLImageElement, box: ProofRect) => {
    const iw = image.naturalWidth;
    const ih = image.naturalHeight;
    const scale = Math.max(box.w / iw, box.h / ih);
    const sw = box.w / scale;
    const sh = box.h / scale;
    context.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, box.x, box.y, box.w, box.h);
  };

  /** The sheet under the lens, magnified: drawn from the layout, not copied
   *  off the page — the frames (at their sharper file when it is in), the
   *  route and the rings, the numbers on their halos, the stubs' paper. */
  const draw = () => {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, D, D);
    const s = dpr * Z;
    ctx.setTransform(s, 0, 0, s, dpr * (R - fx * Z), dpr * (R - fy * Z));
    const half = R / Z + 2;
    const left = fx - half;
    const right = fx + half;
    const top = fy - half;
    const bottom = fy + half;
    const outside = (x: number, y: number, w: number, h: number) => x > right || x + w < left || y > bottom || y + h < top;
    layout.frames.forEach((frame, index) => {
      if (outside(frame.x, frame.y, frame.w, frame.h)) return;
      ctx.fillStyle = FRAME_GROUND;
      ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
      const image = sharp.get(index) ?? images[index];
      if (image && image.complete && image.naturalWidth > 0) drawCover(ctx, image, frame);
    });
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (routePath) {
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.1;
      ctx.stroke(routePath);
    }
    ctx.globalAlpha = 0.94;
    ctx.lineWidth = 1.7;
    ringPaths.forEach((path) => ctx.stroke(path));
    ctx.globalAlpha = 1;
    const widths = labelW ?? (labelW = typeMetrics(ctx));
    ctx.font = `9px ${fontUi}`;
    track('0.54px');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    layout.frames.forEach((frame, index) => {
      const numTop = frame.y + frame.h + PROOF.NUM_TOP;
      if (outside(frame.x - 3, numTop, widths[index] + 6, 9)) return;
      ctx.fillStyle = GROUND;
      ctx.fillRect(frame.x - 3, numTop, widths[index] + 6, 9);
      ctx.fillStyle = frame.isCover ? 'rgba(244, 244, 237, 0.92)' : 'rgba(244, 244, 237, 0.4)';
      ctx.fillText(labels[index], frame.x, numTop + numBase);
    });
    layout.stubs.forEach((stub, row) => {
      if (outside(stub.x, stub.y, stub.w, stub.h)) return;
      // Each stub on its own chapter's card, as the sheet prints it.
      ctx.fillStyle = stockPaper(chapters[row]?.slug);
      ctx.fillRect(stub.x + stub.seam, stub.y, stub.w - stub.seam, stub.h);
      ctx.fillStyle = 'rgba(244, 244, 237, 0.94)';
      ctx.font = `400 ${stub.countSize}px ${fontSerif}`;
      track(`${(-0.02 * stub.countSize).toFixed(2)}px`);
      ctx.textAlign = 'right';
      ctx.fillText(counts[row] ?? '', stub.x + stub.w - PROOF.PRINT_RIGHT, stub.y + stub.tallyTop + numBase);
      ctx.textAlign = 'left';
    });
  };

  const place = () => {
    if (!loupe) return;
    const spot = loupePlace(layout, fx, fy);
    loupe.style.transform = `translate3d(${(spot.x - R).toFixed(2)}px, ${(spot.y - R).toFixed(2)}px, 0)`;
    if (spot.below !== below) {
      below = spot.below;
      loupe.classList.toggle('is-above', !below);
    }
  };

  // The follow: an exponential approach, frame-rate independent, that stops
  // (and stops drawing) once it has arrived.
  const step = (now: number) => {
    raf = 0;
    if (!shown) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    const k = 1 - Math.exp(-dt / LOUPE.TAU);
    fx += (px - fx) * k;
    fy += (py - fy) * k;
    const arrived = Math.abs(px - fx) < 0.05 && Math.abs(py - fy) < 0.05;
    if (arrived) {
      fx = px;
      fy = py;
    }
    place();
    draw();
    if (arrived) last = 0;
    else raf = requestAnimationFrame(step);
  };
  const kick = () => {
    if (!raf && shown) raf = requestAnimationFrame(step);
  };

  const writeCaption = () => {
    const frame = layout.frames[focal];
    const chapter = frame ? chapters[frame.row] : null;
    if (!frame || !chapter) return;
    // In the page's language at each write (a toggle shows from the next
    // frame the loupe rests on).
    const lang = getLang();
    if (captionNo) captionNo.textContent = tr(lang, 'closing.loupe', { nn: pad2(frame.n), total: pad2(total) });
    if (captionPlace) captionPlace.textContent = ` · ${placeOf(chapter, lang)}`;
  };
  const intend = () => {
    window.clearTimeout(intentTimer);
    window.clearTimeout(neighbourTimer);
    const index = focal;
    intentTimer = window.setTimeout(() => {
      want(index);
      // Resting longer: the frames either side, for a pass along the row.
      neighbourTimer = window.setTimeout(() => {
        const frame = layout.frames[index];
        [index - 1, index + 1].forEach((other) => {
          if (layout.frames[other]?.row === frame?.row) want(other);
        });
      }, LOUPE.INTENT * 3);
    }, LOUPE.INTENT);
  };

  const show = () => {
    window.clearTimeout(graceTimer);
    graceTimer = 0;
    if (shown || !loupe) return;
    shown = true;
    // It appears where the pointer is: no glide in from where it last went.
    fx = px;
    fy = py;
    last = 0;
    place();
    draw();
    loupe.classList.add('is-on');
  };
  const hide = () => {
    window.clearTimeout(graceTimer);
    graceTimer = 0;
    window.clearTimeout(intentTimer);
    window.clearTimeout(neighbourTimer);
    if (!shown) return;
    shown = false;
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    focal = -1;
    loupe?.classList.remove('is-on');
  };
  const hideSoon = () => {
    if (!shown || graceTimer) return;
    graceTimer = window.setTimeout(() => {
      graceTimer = 0;
      hide();
    }, LOUPE.GRACE);
  };

  const onMove = (event: PointerEvent) => {
    if (!live || !loupeOn || event.pointerType === 'touch') return;
    if (stale) {
      // Once per gesture: where the sheet is on screen.
      const box = proof.getBoundingClientRect();
      ox = box.left;
      oy = box.top;
      stale = false;
    }
    px = event.clientX - ox;
    py = event.clientY - oy;
    const hit = proofHit(layout, geo.copyRect, px, py);
    if (hit?.kind === 'frame') {
      if (hit.index !== focal) {
        focal = hit.index;
        writeCaption();
        intend();
      }
      show();
      kick();
    } else if (hit) {
      // A stub, the copy, a link: the lens steps off at once.
      hide();
    } else {
      // A gutter, a number band, the ground: it waits a beat.
      hideSoon();
      kick();
    }
  };
  const onLeave = () => {
    stale = true;
    hide();
  };
  const onScroll = () => {
    stale = true;
    hide();
  };

  // ── Choosing: a frame opens its story at that frame; a stub, the story ──
  // Where focus comes back to depends on the hand that opened it. A stub
  // pressed from the keyboard gets its focus back, ring and lit row with it —
  // the reader is mid-Tab. A story opened by a pointer returns focus to the
  // closing itself (a `tabIndex={-1}` target: no ring, global.css): closing
  // it with Escape would otherwise land a :focus-visible lime ring on a stub
  // nobody tabbed to, a second lime mark beside BACK TO INDEX.
  const open = (row: number, frameUrl: string | null, byKeyboard: boolean, source: HTMLElement | null = null) => {
    const chapter = chapters[row];
    if (!chapter) return;
    hide();
    hoverRow = null;
    focusRow = null;
    light();
    stale = true;
    options.open(chapter, frameUrl, byKeyboard ? stubs[row] ?? section : section, source);
  };
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    // A button pressed with Enter or Space clicks with `detail` 0; a pointer
    // (mouse, pen, a tap) counts its clicks from 1. Frames take no focus, so
    // only a stub can be chosen from the keyboard.
    const byKeyboard = event.detail === 0;
    const stub = target?.closest<HTMLElement>('.proof-stub');
    if (stub && proof.contains(stub)) {
      // A stub answers the keyboard at any point of the ending; a pointer
      // can only reach it once the sheet has settled (global.css).
      const row = rowOf(stub);
      if (row != null) open(row, null, byKeyboard);
      return;
    }
    if (!live) return;
    const figure = target?.closest<HTMLElement>('.proof__frame');
    if (!figure || !proof.contains(figure)) return;
    const frame = layout.frames[Number(figure.dataset.index)];
    // The figure goes with the request: the story grows out of this frame.
    if (frame) open(frame.row, frame.url, false, figure);
  };

  const setLive = (on: boolean) => {
    cancelAnimationFrame(liveFrame);
    liveFrame = 0;
    if (!on) {
      live = false;
      proof.classList.remove('is-live');
      hide();
      light();
      return;
    }
    if (live || disposed) return;
    // Two frames on: the settled sheet has been styled once without the
    // hands' transitions, so a jump to rest is shown, never faded into.
    liveFrame = requestAnimationFrame(() => {
      liveFrame = requestAnimationFrame(() => {
        liveFrame = 0;
        if (disposed) return;
        live = true;
        stale = true;
        proof.classList.add('is-live');
        light();
      });
    });
  };

  stubs.forEach((stub) => {
    stub.addEventListener('pointerenter', onStubEnter);
    stub.addEventListener('pointerleave', onStubLeave);
    stub.addEventListener('focus', onStubFocus);
    stub.addEventListener('blur', onStubBlur);
  });
  proof.addEventListener('click', onClick);
  if (loupeOn) {
    section.addEventListener('pointermove', onMove, { passive: true });
    section.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('blur', onLeave);
  }

  const dispose = () => {
    setLive(false);
    disposed = true;
    stubs.forEach((stub) => {
      stub.removeEventListener('pointerenter', onStubEnter);
      stub.removeEventListener('pointerleave', onStubLeave);
      stub.removeEventListener('focus', onStubFocus);
      stub.removeEventListener('blur', onStubBlur);
    });
    proof.removeEventListener('click', onClick);
    section.removeEventListener('pointermove', onMove);
    section.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('blur', onLeave);
    window.clearTimeout(graceTimer);
    window.clearTimeout(intentTimer);
    window.clearTimeout(neighbourTimer);
    cancelAnimationFrame(raf);
    rowParts.flat().forEach((node) => node.classList.remove('is-lit'));
    proof.classList.remove('has-lit', 'is-live');
    sharp.clear();
  };

  return { setLive, dispose };
}
