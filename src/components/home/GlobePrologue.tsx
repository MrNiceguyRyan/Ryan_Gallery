import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion, type MotionValue } from 'framer-motion';
import type Lenis from 'lenis';
import { ARCHIVE_ENTRY_LEAD } from '../../lib/archiveEntrance';
import { smootherstep } from '../../lib/motion';
import {
  ROLL,
  bandRecede,
  gateCrossings,
  landingPose,
  pad2,
  rollCuts,
  rollX,
  rollXStill,
  statementState,
  type RollFrame,
  type RollLayout,
} from '../../lib/bridgeRoll';

interface PrologueCity {
  name: string;
  /** DOM id of the chapter the name jumps to. */
  id: string;
  /** Collection id — the stop the globe lights while the mark is pointed at. */
  chapterId: string;
  /** State or region, when it says more than the name. */
  region?: string;
  frames: number;
  year?: number | string;
  /** The chapter's piece of the bridge's roll: its select (the cover) with
   *  the frame either side of it (src/lib/bridgeRoll.ts, `rollFrames`). */
  roll: RollFrame[];
}

interface Props {
  chapters: number;
  frames: number;
  years: string;
  cities: PrologueCity[];
  onSelect: (anchorId: string) => void;
  /** Hover/focus on a chapter mark lights its stop on the globe (null clears). */
  onHighlight?: (chapterId: string | null) => void;
  /** Prologue progress 0–1 (HomePage's clock for the globe). */
  progress?: MotionValue<number>;
  /** The page's smooth scroll. The roll is written from its scroll event, in
   *  the very frame the page moves, so the landing meets chapter 1's plate on
   *  the pixel; without it (reduced motion, a touch screen) from the
   *  window's own scroll. */
  lenis?: Lenis | null;
  /** The progress at which each chapter's select crosses the gate, the last
   *  chapter first (null until the roll is laid out): the globe lights each
   *  place from these (RouteAtlas, "The roll's places"). */
  onRollGates?: (gates: number[] | null) => void;
}

// The globe's easter eggs take the keyboard too, on the first screen only
// (GlobeEggs listens for `archive:globe-egg`): Enter spins, Space held past
// EGG_HOLD_MS opens the shutter until it is let go, a tap of Space spins.
const EGG_Q_MAX = 0.2;
const EGG_HOLD_MS = 450;
const sendGlobeEgg = (type: 'spin' | 'bulb-start' | 'bulb-end') =>
  window.dispatchEvent(new CustomEvent('archive:globe-egg', { detail: { type } }));

// The chapters' reading line (HomePage, `archiveChapterAnchorY`): a chapter is
// arrived at when its photograph's centre sits this far down the viewport.
const READING_LINE = 0.48;
// The plate's grade over its photograph on the reading line (ArchiveChapter:
// the matte at a chapter's own centre). The lander takes it on as it grows,
// so the frame it hands over is the plate's own.
const PLATE_MATTE = 0.24;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** An element's box in document px from the offset chain: untransformed and
 *  scroll-independent (never a rect). */
function documentBox(node: HTMLElement) {
  let top = 0;
  let left = 0;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  let current: HTMLElement | null = node;
  while (current) {
    top += current.offsetTop;
    left += current.offsetLeft;
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return { l: left, t: top, w, h };
}

/** The bridge laid out for one viewport (see src/lib/bridgeRoll.ts). */
interface BridgeGeo {
  W: number;
  H: number;
  layout: RollLayout;
  X0: number;
  X1: number;
  gateX: number;
  /** The prologue clock: q = (scrollY − prologueTop) / qSpan (HomePage's
   *  `prologueProgressAt`, from the same offsets). */
  prologueTop: number;
  qSpan: number;
  /** The landing clock: L = (scrollY − entryAt) / span, 1 when chapter 1's
   *  plate is on the reading line (scrollY = anchor). */
  entryAt: number;
  anchor: number;
  span: number;
  plate: { l: number; t: number; w: number; h: number };
  from: { x: number; y: number; scale: number };
  slot: { x: number; y: number };
}

/**
 * GlobePrologue — the desktop homepage's opening, laid over the live atlas.
 *
 * After 11 mois sans toi(t): his name over a whole, lit globe half off the
 * bottom-right corner. Then the bridge (src/lib/bridgeRoll.ts): the tagline
 * hands over to a statement of what this is, and a roll of his own frames
 * runs through it along the foot of the screen, the last chapter first,
 * while the planet turns west and glides to the atlas's focal point; each
 * place lights on the globe as its frames pass. The roll comes to rest with
 * chapter 1's select on its plate's left edge, and while the globe dives
 * into the first chapter that frame is lifted out and grows and rises into
 * the plate's exact pixels. The globe itself is the RouteAtlas map (driven
 * by `prologueProgress`); this component is the type and the roll.
 */
export default function GlobePrologue({ chapters, frames, years, cities, onSelect, onHighlight, progress, lenis = null, onRollGates }: Props) {
  const reduce = useReducedMotion();
  // The egg's key: client-only (a mouse or a pen beside the keyboard, as the
  // eggs themselves need), in the tab order only while the globe can play.
  const [eggKey, setEggKey] = useState(false);
  const [eggKeyTab, setEggKeyTab] = useState(0);
  const eggKeyTabRef = useRef(0);
  const spaceHoldRef = useRef<{ timer: number; bulb: boolean } | null>(null);
  const eggKeyAtRef = useRef(0);
  useEffect(() => {
    if (reduce || !progress) {
      setEggKey(false);
      return;
    }
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setEggKey(query.matches);
    sync();
    query.addEventListener('change', sync);
    const tab = (value: number) => {
      const next = value < EGG_Q_MAX ? 0 : -1;
      if (next === eggKeyTabRef.current) return;
      eggKeyTabRef.current = next;
      setEggKeyTab(next);
    };
    tab(progress.get());
    const unsubscribe = progress.on('change', tab);
    return () => {
      query.removeEventListener('change', sync);
      unsubscribe();
    };
  }, [progress, reduce]);
  const endSpaceHold = (send: boolean) => {
    const hold = spaceHoldRef.current;
    spaceHoldRef.current = null;
    if (!hold) return;
    window.clearTimeout(hold.timer);
    if (hold.bulb) sendGlobeEgg('bulb-end');
    else if (send) sendGlobeEgg('spin');
  };

  // ── The bridge ──
  const rootRef = useRef<HTMLDivElement>(null);
  const sayOneRef = useRef<HTMLDivElement>(null);
  const sayTwoRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const landerRef = useRef<HTMLDivElement>(null);
  // The lander lives outside the prologue's layer, beside the archive: under
  // the archive column (chapter 1's name overlaps its plate's foot and must
  // stay over it, as it does over the plate) and over the atlas. The desktop
  // stage holds both; the lander is set there once the page is live.
  const [landerHost, setLanderHost] = useState<HTMLElement | null>(null);
  // The roll's order: the last chapter first, so it ends on chapter 1.
  const rollCities = useMemo(
    () => cities.map((city, index) => ({ ...city, order: index + 1 })).reverse(),
    [cities],
  );
  const firstSelect = rollCities.at(-1)?.roll.find((frame) => frame.select)?.url ?? '';
  const [geo, setGeo] = useState<BridgeGeo | null>(null);
  const geoRef = useRef<BridgeGeo | null>(null);
  // The frames load once the first screen has had its moment, and the roll
  // is shown only once every one of them has decoded.
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  readyRef.current = ready;
  const reduceRef = useRef(!!reduce);
  reduceRef.current = !!reduce;
  const onRollGatesRef = useRef(onRollGates);
  onRollGatesRef.current = onRollGates;
  // What the last frame wrote: every write below happens on a change only.
  const wroteRef = useRef({
    one: false,
    oneAt: '',
    two: false,
    twoAt: '',
    opening: false,
    x: Number.NaN,
    dropY: Number.NaN,
    opacity: Number.NaN,
    L: Number.NaN,
    lander: false,
    select: false,
    current: -2,
    bridge: '',
    cuts: [] as boolean[],
    y: Number.NaN,
    movedAt: 0,
  });
  const tickRef = useRef<() => void>(() => {});

  // One frame of the bridge, from the scroll position alone. It reads no
  // layout: the geometry is laid out once per viewport (below).
  tickRef.current = () => {
    const g = geoRef.current;
    const root = rootRef.current;
    const band = bandRef.current;
    const lander = landerRef.current;
    if (!g || !root || !band) return;
    const wrote = wroteRef.current;
    const html = document.documentElement;
    const still = reduceRef.current;
    const y = window.scrollY;
    if (y !== wrote.y) {
      wrote.y = y;
      wrote.movedAt = performance.now();
    }
    const q = clamp01((y - g.prologueTop) / g.qSpan);
    // A voyage (a chapter mark, the globe's ticket, Back to index) crosses
    // the bridge in a second or two: the bridge's type and roll step aside
    // for the trip (global.css), and chapter 1's plate is simply there.
    const voyaging = html.dataset.voyage != null || html.dataset.globeVoyage != null;

    // The two statements latch on the prologue clock (class toggles; the
    // transitions are CSS), and the opening steps aside for the first.
    const latch = (node: HTMLElement | null, range: readonly [number, number], key: 'one' | 'two') => {
      const state = statementState(q, range, wrote[key]);
      const at = state.on ? 'on' : state.past ? 'past' : '';
      const atKey = key === 'one' ? 'oneAt' : 'twoAt';
      wrote[key] = state.on;
      if (node && wrote[atKey] !== at) {
        wrote[atKey] = at;
        node.classList.toggle('is-on', state.on);
        node.classList.toggle('is-past', state.past);
      }
      return state;
    };
    const one = latch(sayOneRef.current, ROLL.s1, 'one');
    latch(sayTwoRef.current, ROLL.s2, 'two');
    const opening = one.on || one.past;
    if (opening !== wrote.opening) {
      wrote.opening = opening;
      if (opening) root.dataset.bridgeS1 = '';
      else delete root.dataset.bridgeS1;
    }

    // The roll: one transform on the whole band.
    const x = still ? rollXStill(q, g.layout, g.X0, g.X1, g.W) : rollX(q, g.X0, g.X1);
    const cuts = band.children;
    g.layout.cuts.forEach((cut, index) => {
      const on = x + cut.left < g.W && x + cut.left + cut.width > 0;
      if (wrote.cuts[index] === on) return;
      wrote.cuts[index] = on;
      const node = cuts[index] as HTMLElement | undefined;
      // Off screen a chapter is out of sight entirely: out of the tab order
      // and the accessibility tree, and not painted.
      if (node) node.style.visibility = on ? '' : 'hidden';
    });
    // The chapter whose select last crossed the gate is the current mark.
    let passed = 0;
    while (passed < g.layout.covers.length && x + g.layout.covers[passed] <= g.gateX) passed += 1;
    if (passed - 1 !== wrote.current) {
      wrote.current = passed - 1;
      Array.from(cuts).forEach((node, index) => {
        node.querySelector('.bridge-mark')?.classList.toggle('is-current', index === passed - 1);
      });
    }

    // The landing (see `landingPose`): the frames not chosen step back and
    // fall away under the select, which grows and rises into the plate.
    const L = clamp01((y - g.entryAt) / g.span);
    const landed = y >= g.anchor - 1;
    let opacity = 1;
    let dropY = 0;
    let landerOn = false;
    let selectAway = false;
    if (still) {
      // Reduced motion: no dim, no drop, no growth. Half way down, the roll
      // cuts away and the plate is there.
      opacity = L >= 0.5 ? 0 : 1;
    } else if (L > 0) {
      const recede = bandRecede(L);
      opacity = recede.opacity;
      dropY = recede.dropY;
      landerOn = !landed && !voyaging && readyRef.current;
      selectAway = true;
    }
    const tx = Math.round(x * 100) / 100;
    const ty = Math.round(dropY * 100) / 100;
    if (tx !== wrote.x || ty !== wrote.dropY) {
      wrote.x = tx;
      wrote.dropY = ty;
      band.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    }
    const ink = Math.round(opacity * 1000) / 1000;
    if (ink !== wrote.opacity) {
      wrote.opacity = ink;
      band.style.opacity = String(ink);
      band.style.visibility = ink <= 0 ? 'hidden' : '';
    }
    if (selectAway !== wrote.select) {
      wrote.select = selectAway;
      const select = band.querySelector<HTMLElement>('.bridge-cut:last-child .bridge-frame.is-select');
      if (select) select.style.visibility = selectAway ? 'hidden' : '';
      // Lifted out of the roll: the whole layer steps down under the lander
      // (still over the atlas), so the frames it leaves behind never draw
      // over the select as it grows across them (global.css, "The bridge").
      if (selectAway) root.dataset.bridgeLanding = '';
      else delete root.dataset.bridgeLanding;
    }
    if (!lander) landerOn = false;
    if (lander && landerOn && L !== wrote.L) {
      wrote.L = L;
      const pose = landingPose(L, g.from, g.slot, g.span);
      lander.style.transform = `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, 0) scale(${pose.scale.toFixed(5)})`;
      lander.style.setProperty('--lander-grade', smootherstep(L).toFixed(3));
    }
    if (lander && landerOn !== wrote.lander) {
      wrote.lander = landerOn;
      if (!landerOn) wrote.L = Number.NaN;
      lander.style.visibility = landerOn ? 'visible' : 'hidden';
    }

    // Chapter 1's plate: held (at 0.001 ink, so it stays rasterised) while
    // the select carries it, shown on the frame the select arrives, its stub
    // printing as it lands (global.css, "The bridge"). Its tear waits for the
    // landing too (ArchiveChapter reads data-bridge-landed-at).
    const bridge = voyaging ? 'pass' : (still ? L >= 0.5 : landed) ? 'landed' : 'held';
    if (bridge !== wrote.bridge) {
      const was = wrote.bridge;
      wrote.bridge = bridge;
      html.dataset.bridge = bridge;
      if (bridge === 'held') {
        delete html.dataset.bridgePrint;
        html.dataset.bridgeLandedAt = 'flying';
      } else if (bridge === 'landed' && was === 'held') {
        html.dataset.bridgePrint = '';
        html.dataset.bridgeLandedAt = String(Math.round(performance.now()));
      } else {
        delete html.dataset.bridgePrint;
        delete html.dataset.bridgeLandedAt;
      }
    }
  };

  // The layout: once per viewport, from the files' ratios and a few
  // untransformed offsets. Chapter 1's plate is where the roll comes to rest
  // and where its select lands.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    let disposed = false;
    const measure = () => {
      frame = 0;
      if (disposed) return;
      const chapter = document.querySelector<HTMLElement>('[data-archive-column] [data-archive-chapter][data-chapter-index="0"]');
      const photo = chapter?.querySelector<HTMLElement>('.archive-photo-frame');
      const start = document.querySelector<HTMLElement>('[data-archive-start]');
      if (!photo || !start || photo.offsetHeight <= 0 || root.offsetHeight <= 0) {
        geoRef.current = null;
        setGeo(null);
        onRollGatesRef.current?.(null);
        return;
      }
      const W = document.documentElement.clientWidth;
      const H = window.innerHeight;
      // Where the plate is and how big, to the fraction of a pixel: the
      // offset chain rounds at every level (a pixel out, at 1280), and a
      // lander a fraction smaller crops its photograph a fraction
      // differently. The size is the frame's used size; the place is its
      // ticket's tear box, which never moves (the frame sits at its
      // top-left), read once per layout and only while nothing above it is
      // transformed (a story open over the page moves the column) — else the
      // offset chain stands in.
      const offsets = documentBox(photo);
      const size = getComputedStyle(photo);
      const tearBox = photo.closest('.archive-plate')?.querySelector<HTMLElement>('.archive-plate__tear') ?? null;
      let untransformed = !!tearBox;
      for (let node: HTMLElement | null = tearBox; untransformed && node && node !== document.body; node = node.parentElement) {
        if (getComputedStyle(node).transform !== 'none') untransformed = false;
      }
      const box = untransformed && tearBox ? tearBox.getBoundingClientRect() : null;
      const plate = {
        l: box ? box.left + window.scrollX : offsets.l,
        t: box ? box.top + window.scrollY : offsets.t,
        w: Number.parseFloat(size.width) || photo.offsetWidth,
        h: Number.parseFloat(size.height) || photo.offsetHeight,
      };
      const prologueTop = documentBox(root).t;
      const qSpan = Math.max(1, documentBox(start).t - prologueTop - H * ARCHIVE_ENTRY_LEAD);
      const entryAt = prologueTop + qSpan;
      // HomePage's own anchor for chapter 1 (`archiveChapterAnchorY`), to the
      // same rounding, so "landed" is the frame the chapter clock arrives on.
      const anchor = offsets.t + photo.offsetHeight / 2 - H * READING_LINE;
      // The plate's photograph is drawn on whole CSS pixels (its stage is a
      // layer of its own), so the select lands on them too.
      const slot = { x: Math.round(plate.l), y: Math.round(plate.t - anchor) };
      const frameH = Math.round(ROLL.frameH * H);
      const layout = rollCuts(rollCities.map((city) => ({ order: city.order, frames: city.roll })), frameH);
      const X0 = W + ROLL.enter;
      const X1 = slot.x - layout.select.left;
      const gateX = ROLL.gate * W;
      const next: BridgeGeo = {
        W,
        H,
        layout,
        X0,
        X1,
        gateX,
        prologueTop,
        qSpan,
        entryAt,
        anchor,
        span: Math.max(1, anchor - entryAt),
        plate,
        from: { x: slot.x, y: ROLL.bandBottom * H - frameH, scale: layout.select.width / Math.max(1, plate.w) },
        slot,
      };
      geoRef.current = next;
      setGeo(next);
      onRollGatesRef.current?.(gateCrossings(layout.covers, X0, X1, gateX));
      // Every value is written afresh on the new layout.
      const wrote = wroteRef.current;
      wrote.x = Number.NaN;
      wrote.dropY = Number.NaN;
      wrote.opacity = Number.NaN;
      wrote.L = Number.NaN;
      wrote.cuts = [];
      wrote.current = -2;
      root.dataset.rollLive = '';
      setLanderHost(root.parentElement);
      tickRef.current();
    };
    const remeasure = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);
    const column = document.querySelector<HTMLElement>('[data-archive-column]');
    if (column) resizeObserver?.observe(column);
    window.addEventListener('resize', remeasure, { passive: true });
    document.fonts?.ready.then(() => {
      if (!disposed) remeasure();
    });
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', remeasure);
      delete root.dataset.rollLive;
      delete root.dataset.bridgeS1;
      delete root.dataset.bridgeLanding;
      const html = document.documentElement;
      delete html.dataset.bridge;
      delete html.dataset.bridgePrint;
      delete html.dataset.bridgeLandedAt;
      onRollGatesRef.current?.(null);
    };
  }, [rollCities]);

  // Driven by the scroll: Lenis's own scroll event (the frame it moves the
  // page in), else the window's. The prologue clock, and a voyage starting
  // or ending, ask for a frame too.
  useEffect(() => {
    const run = () => tickRef.current();
    const offLenis = lenis ? lenis.on('scroll', run) : null;
    if (!lenis) window.addEventListener('scroll', run, { passive: true });
    const offProgress = progress?.on('change', run);
    const voyages = typeof MutationObserver === 'undefined' ? null : new MutationObserver(run);
    voyages?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-voyage', 'data-globe-voyage'] });
    run();
    return () => {
      offLenis?.();
      if (!lenis) window.removeEventListener('scroll', run);
      offProgress?.();
      voyages?.disconnect();
    };
  }, [lenis, progress]);

  // The frames load when the page is idle after the first screen, at twice
  // the roll's frame height in pixels.
  useEffect(() => {
    if (!geo || armed) return;
    const arm = () => setArmed(true);
    if ('requestIdleCallback' in window) {
      const idle = window.requestIdleCallback(arm, { timeout: 1500 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = window.setTimeout(arm, 600);
    return () => window.clearTimeout(timer);
  }, [armed, geo]);
  const frameH = geo?.layout.frameH ?? 0;
  useEffect(() => {
    if (!armed || !frameH || !landerHost) return;
    const images = [
      ...Array.from(stageRef.current?.querySelectorAll('img') ?? []),
      ...Array.from(landerRef.current?.querySelectorAll('img') ?? []),
    ];
    let cancelled = false;
    void Promise.all(images.map((image) => (typeof image.decode === 'function' ? image.decode().catch(() => {}) : Promise.resolve())))
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [armed, frameH, landerHost]);
  useEffect(() => {
    wroteRef.current.lander = false;
    wroteRef.current.L = Number.NaN;
    tickRef.current();
  }, [ready, reduce, landerHost]);

  // A mark answers a hand, not the page: the roll carries the marks under a
  // resting cursor as it travels, and each pass would light a place on the
  // globe and re-render the page mid-scroll. Only a pointer that comes onto a
  // mark while the page is still lights it.
  const pointedRef = useRef<string | null>(null);
  const point = (chapterId: string | null, byPointer: boolean) => {
    if (chapterId && byPointer && performance.now() - wroteRef.current.movedAt < 160) return;
    if (!chapterId && pointedRef.current == null) return;
    pointedRef.current = chapterId;
    onHighlight?.(chapterId);
  };

  const frameSrc = (url: string) => (frameH ? `${url}?auto=format&h=${Math.round(frameH * 2.1)}&q=76` : undefined);
  const layoutFor = (order: number) => geo?.layout.cuts.find((cut) => cut.order === order);

  return (
    <div ref={rootRef} className="globe-prologue pointer-events-none absolute inset-x-0 top-0 z-30 hidden lg:block">
      {/* ── 1 · Name ── */}
      {/* The first screen enters in CSS, from the first paint (the
          `prologue-hero-*` classes in global.css). These four are plain
          elements on purpose: framer writes a hidden `initial` into the
          server HTML, so his name used to wait, invisible, for the scripts. */}
      <div className="bridge-opening flex h-[100svh] flex-col justify-end pb-[11svh] pl-[6vw] pr-[40vw]">
        {/* The kicker's dot is bone: the first screen's one lime mark is the
            scroll cue's sweep below. */}
        <p className="prologue-hero-kicker flex items-center gap-3 font-ui text-[11px] uppercase tracking-[0.1em] text-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-[#F4F4ED]" aria-hidden="true" />
          <span>Visual Archive</span>
          {years && <span className="tabular-nums text-white/45">{years}</span>}
        </p>
        <p
          aria-hidden="true"
          className="prologue-display mt-5 font-serif uppercase text-[#F4F4ED]"
          style={{ fontSize: 'clamp(112px, 15.2vw, 280px)' }}
        >
          <span className="prologue-line"><span className="prologue-hero-rise block">Ryan</span></span>
          <span className="prologue-line"><span className="prologue-hero-rise prologue-hero-rise--late block">Xu</span></span>
        </p>
        {/* The measure is in em, not ch: 30ch in the metric fallback is 454px
            at 28px against 542px in Fraunces, so the line wrapped in two until
            the webfont landed and then pulled the whole bottom-anchored column,
            his name included, 38px down. 19.4em is Fraunces' 30ch, in either face. */}
        <p className="prologue-hero-tagline mt-8 max-w-[19.4em] font-serif text-[clamp(20px,1.7vw,28px)] italic leading-snug text-white/78">
          Cities and landscapes, one frame at a time.
        </p>
        <div className="mt-14 flex items-center gap-10">
          {/* Last of the first screen, but inside the name's own rise: the
              cue that says "scroll" must not arrive after the reader already has. */}
          <p
            aria-hidden="true"
            className="prologue-hero-cue flex items-center gap-3 font-ui text-[10px] uppercase tracking-[0.1em] text-white/50"
          >
            <span className="prologue-scroll-cue relative block h-7 w-px overflow-hidden bg-white/18" />
            Scroll
          </p>
          {/* The globe's easter eggs by keyboard. Out of sight until focused;
              focused, one quiet line says what the keys do. */}
          {eggKey && (
            <button
              type="button"
              tabIndex={eggKeyTab}
              className="globe-egg-key sr-only pointer-events-auto whitespace-nowrap font-ui text-[10px] uppercase tracking-[0.1em] text-white/58 focus-visible:not-sr-only focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
              aria-label="Spin the globe: press Enter. Hold Space for a long exposure."
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  eggKeyAtRef.current = performance.now();
                  if (!event.repeat) sendGlobeEgg('spin');
                  return;
                }
                if (event.key !== ' ') return;
                event.preventDefault();
                eggKeyAtRef.current = performance.now();
                if (event.repeat || spaceHoldRef.current) return;
                const hold = { timer: 0, bulb: false };
                hold.timer = window.setTimeout(() => {
                  hold.bulb = true;
                  sendGlobeEgg('bulb-start');
                }, EGG_HOLD_MS);
                spaceHoldRef.current = hold;
              }}
              onKeyUp={(event) => {
                if (event.key !== ' ') return;
                event.preventDefault();
                eggKeyAtRef.current = performance.now();
                endSpaceHold(true);
              }}
              onBlur={() => endSpaceHold(false)}
              onClick={() => {
                // Keys are handled above; a click that follows one is its echo.
                if (performance.now() - eggKeyAtRef.current < 400) return;
                sendGlobeEgg('spin');
              }}
            >
              Spin the globe · Enter<span className="ml-6">Hold Space · Bulb</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 2 · What this is ── */}
      {/* The first statement. Rendered in the page's flow, so the first paint
          and a page without scripts read it where it stands; live, it is held
          to the screen and latches on the prologue clock (global.css, "The
          bridge"). */}
      <div className="flex h-[90svh] items-center pl-[6vw] pr-[36vw]">
        <div ref={sayOneRef} className="bridge-say bridge-say--one">
          <p className="bridge-say__kicker font-ui">
            <span className="bridge-say__dot" aria-hidden="true" />
            <span>Light. Geometry. Stillness.</span>
          </p>
          <h2 className="bridge-say__line bridge-say__line--one font-serif">
            A personal archive of <em>travel</em> and <em>thought</em>.
          </h2>
        </div>
      </div>

      {/* ── 3 · The roll ── */}
      {/* The nav gives the scroll its length and is where Back to index (the
          closing) moves focus; RouteAtlas sizes the index-step planet beside
          its left edge. Inside it, the roll's layer: the second statement,
          the band of frames with a mark per chapter (each one a way into it),
          and the select that lands in chapter 1's plate. */}
      <nav
        id="archive-index"
        aria-label="Archive index"
        tabIndex={-1}
        className="pointer-events-none ml-auto h-[110svh] w-[44vw] focus:outline-none"
      >
        <div className="bridge-roll">
          <div ref={sayTwoRef} className="bridge-say bridge-say--two">
            <p className="bridge-say__line bridge-say__line--two font-serif">
              Frames selected on a slow timeline, organized by location, dated.
            </p>
            <p className="bridge-say__foot font-ui">
              {pad2(chapters)} chapters · {pad2(frames)} frames
            </p>
          </div>
          <div ref={stageRef} className="bridge-stage" data-ready={ready ? '' : undefined}>
            <div ref={bandRef} className="bridge-band">
              {rollCities.map((city) => {
                const cut = layoutFor(city.order);
                return (
                  <div
                    key={city.chapterId}
                    className="bridge-cut"
                    style={cut ? { left: cut.left, width: cut.width } : undefined}
                  >
                    <button
                      type="button"
                      className="bridge-mark font-ui"
                      aria-label={`Go to chapter ${city.order}: ${city.name}`}
                      onClick={() => {
                        point(null, false);
                        onSelect(city.id);
                      }}
                      onPointerEnter={() => point(city.chapterId, true)}
                      onPointerLeave={() => point(null, true)}
                      onFocus={() => point(city.chapterId, false)}
                      onBlur={() => point(null, false)}
                    >
                      <b>{pad2(city.order)}</b>
                      <span className="bridge-mark__name">{city.name}</span>
                      <span>
                        {city.region ? `${city.region} · ` : ''}{pad2(city.frames)} frames{city.year != null ? ` · ${city.year}` : ''}
                      </span>
                    </button>
                    <div className="bridge-row" aria-hidden="true">
                      {city.roll.map((frame, index) => {
                        const box = cut?.frames[index];
                        return (
                          <div
                            key={frame.n}
                            className={`bridge-frame${frame.select ? ' is-select' : ''}`}
                            style={box ? { width: box.width, height: frameH } : undefined}
                          >
                            <img alt="" src={armed ? frameSrc(frame.url) : undefined} decoding="async" draggable={false} />
                            <span className="bridge-frame__n font-ui">{pad2(frame.n)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </nav>
      {/* The select on its way into the plate: the plate's own file (the
          same srcset and sizes as ArchiveChapter's, so the browser picks the
          very candidate the plate shows) under the plate's own grade, which
          it takes on as it grows. */}
      {landerHost && createPortal(
        <div
          ref={landerRef}
          className="bridge-lander"
          aria-hidden="true"
          style={geo ? { width: geo.plate.w, height: geo.plate.h } : undefined}
        >
          {firstSelect && (
            <img
              alt=""
              src={armed ? `${firstSelect}?auto=format&w=1600&q=82` : undefined}
              srcSet={armed ? `${firstSelect}?auto=format&w=1000&q=82 1000w, ${firstSelect}?auto=format&w=1600&q=82 1600w, ${firstSelect}?auto=format&w=2000&q=78 2000w` : undefined}
              sizes="(min-width: 1900px) 1100px, (min-width: 1024px) 58vw, 100vw"
              decoding="async"
              draggable={false}
            />
          )}
          <i className="bridge-lander__matte" style={{ ['--plate-matte' as never]: PLATE_MATTE }} />
          <i className="bridge-lander__shade-top" />
          <i className="bridge-lander__shade-bottom" />
        </div>,
        landerHost,
      )}
    </div>
  );
}
