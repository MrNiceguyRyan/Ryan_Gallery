import { useEffect, useRef } from 'react';
import OpeningScenes from './OpeningScenes';
import {
  CODE_BEATS,
  FF_TAIL,
  FILM_DESKTOP,
  FILM_PHONE,
  GLOBE_WAIT_MS,
  LANDING_A,
  LANDING_B,
  OPENING_EVENT,
  PHONE_MAX_WIDTH,
  RAIN_DIM,
  STILL,
  cameraFor,
  cameraTransform,
  clamp01,
  cutSchedule,
  fastForwardTarget,
  filmLength,
  finderBox,
  finderTrack,
  flightFor,
  flightPath,
  focusAt,
  globeReleaseAt,
  landingAEnd,
  landingFrom,
  onScreen,
  portalAt,
  portalTarget,
  runProgress,
  segment,
  slateBeats,
  type Anchor,
  type Box,
  type Camera,
  type Cut,
  type FinderKey,
  type Landing,
  type OpeningDetail,
  type OpeningState,
  type Vec2,
} from '../../lib/openingFilm';
import { markReelSeen } from '../../lib/reelVisit';
import { EASE } from '../../lib/motion';

const bezier = ([a, b, c, d]: readonly number[]) => `cubic-bezier(${a}, ${b}, ${c}, ${d})`;
const EASES = {
  arrive: bezier(EASE.arrive),
  travel: bezier(EASE.travel),
  fade: bezier(EASE.fade),
  leave: bezier(EASE.leave),
  linear: 'linear',
} as const;
// The word lifting off the rain toward the lens: slow to leave, soft to land.
const LIFT_EASE = 'cubic-bezier(0.5, 0, 0.15, 1)';
// The finder's padding round a word, px (on a phone a little less).
const FINDER_PAD = { desktop: 16, phone: 10 } as const;
// Keys that scroll a page: held (and taken as the reader's hurry) while the
// film plays.
const SCROLL_KEYS = new Set([' ', 'Spacebar', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End']);

interface Measured {
  /** The word's centre and cap height in its sheet (sheet px). */
  anchor: Anchor;
  /** Its ink box in the sheet. */
  ink: Box;
}

interface SceneRig {
  cut: Cut;
  scene: HTMLElement;
  sheet: HTMLElement | null;
  measured: Measured | null;
}

/** The canvas context used to measure type (one, reused). */
let measureContext: CanvasRenderingContext2D | null = null;
function inkOf(el: HTMLElement, text: string) {
  const style = getComputedStyle(el);
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  const ctx = measureContext;
  const size = parseFloat(style.fontSize) || 16;
  if (!ctx) return { ascent: size * 0.7, descent: 0, left: 0, right: size * 0.6 * text.length, size };
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const spacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing;
  } catch {
    // (An older engine without canvas letter-spacing measures without it.)
  }
  const shown = style.textTransform === 'uppercase' ? text.toUpperCase() : text;
  const m = ctx.measureText(shown);
  return {
    ascent: m.actualBoundingBoxAscent,
    descent: m.actualBoundingBoxDescent,
    left: m.actualBoundingBoxLeft,
    right: m.actualBoundingBoxRight,
    size,
  };
}

/** An element's position inside `container` (its offsetParent chain; no
 *  transform is read). */
function offsetIn(el: HTMLElement, container: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/** A found word in its sheet: its ink box, its centre and its cap height. */
function measureFind(find: HTMLElement, container: HTMLElement): Measured {
  const at = offsetIn(find, container);
  const probe = find.querySelector<HTMLElement>('.of-bl');
  const baseline = probe ? offsetIn(probe, container).y : at.y + find.offsetHeight * 0.8;
  const inkText = find.dataset.ink;
  const text = inkText && inkText !== 'box' ? inkText : (find.textContent || '').trim();
  const ink = inkOf(find, text);
  if (inkText === 'box') {
    const box = { x: at.x, y: at.y, w: find.offsetWidth, h: find.offsetHeight };
    // The tiles' own letters give the size to match.
    const letter = find.querySelector<HTMLElement>('.of-flap') ?? find;
    const cap = inkOf(letter, text).ascent;
    return { anchor: { x: box.x + box.w / 2, y: box.y + box.h / 2, cap }, ink: box };
  }
  const box = { x: at.x - ink.left, y: baseline - ink.ascent, w: ink.left + ink.right, h: ink.ascent + ink.descent };
  return { anchor: { x: box.x + box.w / 2, y: baseline - ink.ascent / 2, cap: ink.ascent }, ink: box };
}

function textBox(el: Element): Box | null {
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = range.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

const grow = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });

/**
 * OpeningFilm — the homepage's opening: a word hunt through many texts
 * (src/lib/openingFilm.ts has the score and the reasons).
 *
 * A fixed layer over the first screen from the first paint (the server's
 * markup IS scene one: the code rain falls and ARCHIVE locks in CSS before
 * any script). Once this island is up, the rest of the film is WAAPI on
 * transforms and opacity — the compositor plays it, so the page's own
 * hydration and the map's start-up behind it cannot stutter it — timed
 * from the same start as the CSS. The page's scroll is held (body
 * overflow: clip, the one lock the sticky atlas survives) and any wheel,
 * touch, key or click fast-forwards to the clapperboard and the landing.
 *
 * It plays once a tab session (src/lib/reelVisit.ts decides before the first
 * paint: html[data-opening] present means it plays).
 */
export default function OpeningFilm() {
  const rootRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const overlay = rootRef.current;
    const skip = skipRef.current;
    const html = document.documentElement;
    if (!overlay || !skip) return;
    if (!html.hasAttribute('data-opening') || html.dataset.reel === 'skip') return;

    const body = document.body;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const landing: Landing = landingFrom(window.location.search);
    const stage = overlay.querySelector<HTMLElement>('[data-stage]')!;
    const finder = overlay.querySelector<HTMLElement>('[data-finder]')!;
    const corners = Array.from(finder.querySelectorAll<HTMLElement>('.of-finder__c'));
    const flightLayer = overlay.querySelector<HTMLElement>('[data-flight]')!;
    const portal = overlay.querySelector<HTMLCanvasElement>('[data-portal]')!;
    const hud = overlay.querySelector<HTMLElement>('.of-hud');
    const sceneNo = overlay.querySelector<HTMLElement>('.of-digits--sc .of-digits__strip');
    const grain = overlay.querySelector<HTMLElement>('.of-grain');
    const vignette = overlay.querySelector<HTMLElement>('.of-vignette');

    let disposed = false;
    let state: OpeningState = 'film';
    let globe = false;
    let phase: 'film' | 'landing' | 'done' = 'film';
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!disposed) fn();
      }, Math.max(0, ms));
      timers.add(id);
      return id;
    };
    const clearTimers = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
    const publish = () => {
      const detail: OpeningDetail = { state, globe };
      window.__archiveOpening = detail;
      window.dispatchEvent(new CustomEvent<OpeningDetail>(OPENING_EVENT, { detail }));
    };
    const releaseGlobe = () => {
      if (globe) return;
      globe = true;
      publish();
    };

    // ── The scroll is held while the film plays ──
    const previousOverflow = body.style.overflow;
    let locked = false;
    const lock = () => {
      if (locked) return;
      locked = true;
      body.style.overflow = 'clip';
    };
    const unlock = () => {
      if (!locked) return;
      locked = false;
      if (body.style.overflow === 'clip') body.style.overflow = previousOverflow;
    };

    // A reload deep in the page (a position restored below the first
    // screen) is not an arrival: no film, the reader keeps his place.
    if (window.scrollY > window.innerHeight * 0.5) {
      html.dataset.reel = 'page';
      html.removeAttribute('data-opening');
      state = 'page';
      globe = true;
      publish();
      return;
    }
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    // The island has the film (the CSS failsafe stands down).
    html.setAttribute('data-opening', 'run');
    lock();
    publish();

    let seen = false;
    const markSeen = () => {
      if (seen) return;
      seen = true;
      markReelSeen();
    };

    // ── The end: the page is the page ──
    const finish = () => {
      if (phase === 'done') return;
      phase = 'done';
      clearTimers();
      detachInput();
      unlock();
      markSeen();
      html.removeAttribute('data-opening');
      html.removeAttribute('data-open-fly');
      html.removeAttribute('data-open-globe');
      skip.classList.remove('is-gone');
      state = 'page';
      globe = true;
      publish();
      // The film's animations are done with; free their layers.
      overlay.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      flightLayer.replaceChildren();
    };

    // ── Input: the reader's hurry ──
    let onHurry: () => void = () => {};
    const hurry = () => onHurry();
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      hurry();
    };
    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onTouchStart = () => hurry();
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      hurry();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (SCROLL_KEYS.has(event.key)) event.preventDefault();
      hurry();
    };
    const onSkip = (event: MouseEvent) => {
      event.preventDefault();
      hurry();
    };
    let inputAttached = false;
    const attachInput = () => {
      if (inputAttached) return;
      inputAttached = true;
      window.addEventListener('wheel', onWheel, { capture: true, passive: false });
      window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
      window.addEventListener('pointerdown', onPointerDown, { capture: true });
      window.addEventListener('keydown', onKeyDown, { capture: true });
      skip.addEventListener('click', onSkip);
    };
    const detachInput = () => {
      if (!inputAttached) return;
      inputAttached = false;
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('touchmove', onTouchMove, { capture: true });
      window.removeEventListener('touchstart', onTouchStart, { capture: true });
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      skip.removeEventListener('click', onSkip);
    };
    attachInput();

    // ── Reduced motion: the clapperboard still, then a calm crossfade ──
    if (reduce) {
      state = 'film';
      let fading = false;
      const fade = () => {
        if (fading) return;
        fading = true;
        markSeen();
        releaseGlobe();
        html.dataset.reel = 'page';
        state = 'landing';
        publish();
        skip.classList.add('is-gone');
        overlay.style.opacity = '0';
        later(finish, STILL.fade + 40);
      };
      onHurry = fade;
      later(fade, STILL.hold);
      return () => {
        disposed = true;
        clearTimers();
        detachInput();
        unlock();
        overlay.style.opacity = '';
        if (html.hasAttribute('data-opening')) html.removeAttribute('data-opening');
      };
    }

    // ── The film ──
    const timeline = document.timeline;
    const nowMs = () => Number(timeline.currentTime ?? performance.now());
    const phone = () => window.innerWidth <= PHONE_MAX_WIDTH;
    let cuts: Cut[] = cutSchedule(phone() ? FILM_PHONE : FILM_DESKTOP);
    let rigs: SceneRig[] = [];
    let filmAnims: Animation[] = [];
    // The film's clock: film time = timeline time − t0.
    let t0 = nowMs();
    // The CSS half of scene one (the rain, the scramble) started with the
    // first style of the page; the film starts from it if the island is up
    // in time for the lift, and otherwise from where the lift would begin.
    const cssRef = overlay
      .getAnimations({ subtree: true })
      .find((a) => (a as CSSAnimation).animationName === 'of-scramble');
    const cssStart = cssRef && cssRef.startTime != null ? Number(cssRef.startTime) : nowMs();
    t0 = Math.max(cssStart, nowMs() - (CODE_BEATS.lift[0] - 100));

    const filmTime = () => nowMs() - t0;

    // Shift every animation of the film (CSS and WAAPI) by `delta` ms of
    // timeline: the one clock moves as one.
    const shiftAll = (delta: number) => {
      overlay.getAnimations({ subtree: true }).forEach((a) => {
        if (a.startTime != null) a.startTime = Number(a.startTime) + delta;
      });
      t0 += delta;
    };

    const measureAll = (): { cap: number; archiveFocus: Vec2; lockInk: Box } => {
      const lock = overlay.querySelector<HTMLElement>('[data-lock]')!;
      const word = lock.querySelector<HTMLElement>('.of-lock__word')!;
      // The locked word at full size: its box centred on the lock point.
      const lx = lock.offsetLeft;
      const ly = lock.offsetTop;
      const w = word.offsetWidth;
      const h = word.offsetHeight;
      const probe = word.querySelector<HTMLElement>('.of-bl');
      const baseline = ly - h / 2 + (probe ? probe.offsetTop : h * 0.8);
      const ink = inkOf(word, 'ARCHIVE');
      const left = lx - w / 2;
      const lockInk: Box = { x: left - ink.left, y: baseline - ink.ascent, w: ink.left + ink.right, h: ink.ascent + ink.descent };
      const cap = ink.ascent;
      const archiveFocus: Vec2 = [lockInk.x + lockInk.w / 2, baseline - ink.ascent / 2];
      rigs = cuts.map((cut) => {
        const scene = stage.querySelector<HTMLElement>(`[data-scene="${cut.id}"]`)!;
        const sheet = scene.querySelector<HTMLElement>('[data-sheet]');
        const find = sheet?.querySelector<HTMLElement>('[data-find]');
        return { cut, scene, sheet, measured: sheet && find ? measureFind(find, sheet) : null };
      });
      return { cap, archiveFocus, lockInk };
    };

    let geometry = measureAll();

    const camAt = (i: number, t: number): Camera | null => {
      const rig = rigs[i];
      if (!rig.measured) return null;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const focus = focusAt(cuts, i, t, w, h, phone(), geometry.archiveFocus);
      return cameraFor(rig.measured.anchor, focus, geometry.cap, runProgress(cuts, i, t));
    };

    const build = () => {
      filmAnims.forEach((a) => a.cancel());
      filmAnims = [];
      const end = filmLength(cuts);
      const total = end + 60;
      const at = (t: number) => clamp01(t / total);
      const play = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions = {}) => {
        // (Offsets never run backwards, whatever a retimed beat asks: an
        // out-of-order keyframe would throw and leave the film half built.)
        let floor = 0;
        keyframes.forEach((k) => {
          if (typeof k.offset === 'number') {
            k.offset = Math.min(1, Math.max(floor, k.offset));
            floor = k.offset;
          }
        });
        const anim = el.animate(keyframes, { duration: total, fill: 'both', easing: 'linear', ...options });
        anim.startTime = t0;
        filmAnims.push(anim);
        return anim;
      };

      // Scenes not in this layout's film stay dark.
      const used = new Set(cuts.map((c) => c.id));
      stage.querySelectorAll<HTMLElement>('[data-scene]').forEach((scene) => {
        if (!used.has(scene.dataset.scene as Cut['id'])) scene.style.visibility = 'hidden';
        else scene.style.visibility = '';
      });

      // ── Cuts and cameras ──
      rigs.forEach((rig, i) => {
        const { cut } = rig;
        const last = i === rigs.length - 1;
        const opacity: Keyframe[] = [];
        if (i === 0) {
          opacity.push({ offset: 0, opacity: 1 }, { offset: at(cut.end), opacity: 1 }, { offset: at(cut.end), opacity: 0 }, { offset: 1, opacity: 0 });
        } else {
          opacity.push({ offset: 0, opacity: 0 }, { offset: at(cut.start), opacity: 0 }, { offset: at(cut.start), opacity: 1 });
          if (last) opacity.push({ offset: 1, opacity: 1 });
          else opacity.push({ offset: at(cut.end), opacity: 1 }, { offset: at(cut.end), opacity: 0 }, { offset: 1, opacity: 0 });
        }
        play(rig.scene, opacity);
        if (i === 0 || !rig.sheet) return;
        const a = camAt(i, cut.start);
        const b = camAt(i, cut.end);
        if (!a || !b) return;
        play(rig.sheet, [
          { offset: 0, transform: cameraTransform(a) },
          { offset: at(cut.start), transform: cameraTransform(a) },
          { offset: at(cut.end), transform: cameraTransform(b) },
          { offset: 1, transform: cameraTransform(b) },
        ]);
      });

      // ── Scene one: the word lifts off the rain; the rain dims and pushes ──
      const code = rigs[0];
      const lockWord = code.scene.querySelector<HTMLElement>('.of-lock__word');
      const lockCells = code.scene.querySelector<HTMLElement>('.of-lock__cells');
      const rain = code.scene.querySelector<HTMLElement>('[data-rain]');
      const k0 = getComputedStyle(overlay).getPropertyValue('--of-k0').trim() || '0.2';
      const lifted = (k: string) => `translate(-50%, -50%) scale(${k})`;
      const [liftA, liftB] = CODE_BEATS.lift;
      if (lockWord) {
        play(lockWord, [
          { offset: 0, transform: lifted(k0) },
          { offset: at(liftA), transform: lifted(k0), easing: LIFT_EASE },
          { offset: at(liftB), transform: lifted('1') },
          { offset: 1, transform: lifted('1') },
        ]);
      }
      if (lockCells) {
        play(lockCells, [
          { offset: 0, transform: lifted(k0), opacity: 1 },
          { offset: at(liftA), transform: lifted(k0), opacity: 1, easing: LIFT_EASE },
          { offset: at(liftA + (liftB - liftA) * 0.5), opacity: 0 },
          { offset: at(liftB), transform: lifted('1'), opacity: 0 },
          { offset: 1, transform: lifted('1'), opacity: 0 },
        ]);
      }
      if (rain) {
        const [dimA, dimB] = CODE_BEATS.dim;
        play(rain, [
          { offset: 0, opacity: 1, transform: 'scale(1)' },
          { offset: at(dimA), opacity: 1 },
          { offset: at(dimB), opacity: RAIN_DIM },
          { offset: at(code.cut.end), opacity: RAIN_DIM * 0.9, transform: 'scale(1.05)' },
          { offset: 1, opacity: RAIN_DIM * 0.9, transform: 'scale(1.05)' },
        ]);
      }

      // ── The finder ──
      const pad = FINDER_PAD[phone() ? 'phone' : 'desktop'];
      const boxes: [Box, Box][] = rigs.map((rig, i) => {
        if (i === 0) {
          const b = finderBox(geometry.lockInk, pad);
          return [b, b];
        }
        const a = camAt(i, rig.cut.start);
        const b = camAt(i, rig.cut.end);
        if (!a || !b || !rig.measured) {
          const fallback = finderBox(geometry.lockInk, pad);
          return [fallback, fallback];
        }
        return [finderBox(onScreen(rig.measured.ink, a), pad), finderBox(onScreen(rig.measured.ink, b), pad)];
      });
      const [finderA, finderB] = CODE_BEATS.finder;
      const keys: FinderKey[] = [
        { t: 0, box: grow(boxes[0][0], 46), ease: 'linear' },
        { t: finderA, box: grow(boxes[0][0], 46), ease: 'arrive' },
        ...finderTrack(cuts, boxes, finderB),
      ];
      const arm = corners[0]?.offsetWidth || 22;
      const cornerAt = (box: Box, which: number) => {
        const x = which % 2 === 0 ? box.x : box.x + box.w - arm;
        const y = which < 2 ? box.y : box.y + box.h - arm;
        return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      };
      corners.forEach((corner, which) => {
        const frames: Keyframe[] = [];
        let lastOffset = 0;
        keys.forEach((key) => {
          const offset = Math.max(lastOffset, at(key.t));
          lastOffset = offset;
          frames.push({ offset, transform: cornerAt(key.box, which), easing: EASES[key.ease] });
        });
        frames.push({ offset: 1, transform: cornerAt(keys[keys.length - 1].box, which) });
        frames[0].offset = 0;
        play(corner, frames);
      });
      play(finder, [
        { offset: 0, opacity: 0 },
        { offset: at(finderA), opacity: 0 },
        { offset: at(finderA + 140), opacity: 1 },
        { offset: 1, opacity: 1 },
      ]);

      // ── The scene count ──
      if (sceneNo) {
        const frames: Keyframe[] = [{ offset: 0, transform: 'translateY(0em)' }];
        cuts.forEach((cut, i) => {
          if (i === 0) return;
          frames.push({ offset: at(cut.start), transform: `translateY(-${i - 1}em)` });
          frames.push({ offset: at(cut.start), transform: `translateY(-${i}em)` });
        });
        frames.push({ offset: 1, transform: `translateY(-${cuts.length - 1}em)` });
        play(sceneNo, frames);
      }

      // ── The clapperboard's own life ──
      const slate = rigs[rigs.length - 1];
      const beats = slateBeats(slate.cut.ms);
      slate.scene.querySelectorAll<SVGElement>('.of-chalk').forEach((chalk, k) => {
        const from = slate.cut.start + beats.underline[Math.min(k, beats.underline.length - 1)];
        play(chalk, [
          { offset: 0, strokeDashoffset: 1 },
          { offset: at(from), strokeDashoffset: 1, easing: EASES.arrive },
          { offset: at(from + beats.underlineMs), strokeDashoffset: 0 },
          { offset: 1, strokeDashoffset: 0 },
        ]);
      });
      // The clap: the board gives a little under the sticks.
      const clapAt = slate.cut.start + beats.clap[1];
      const joltSpan = total + 320;
      play(
        slate.scene,
        [
          { offset: 0, transform: 'translate3d(0, 0, 0)' },
          { offset: clapAt / joltSpan, transform: 'translate3d(0, 0, 0)', easing: EASES.arrive },
          { offset: (clapAt + 50) / joltSpan, transform: 'translate3d(0, 5px, 0)', easing: EASES.arrive },
          { offset: (clapAt + 280) / joltSpan, transform: 'translate3d(0, 0, 0)' },
          { offset: 1, transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: joltSpan },
      );
      const clapper = slate.scene.querySelector<HTMLElement>('[data-clapper]');
      if (clapper) {
        play(clapper, [
          { offset: 0, transform: 'rotate(-17deg)' },
          { offset: at(slate.cut.start + beats.clap[0]), transform: 'rotate(-17deg)', easing: EASES.leave },
          { offset: at(slate.cut.start + beats.clap[1]), transform: 'rotate(0deg)' },
          { offset: 1, transform: 'rotate(0deg)' },
        ]);
      }
    };

    // ── The film's own clock: the moments the page hears about ──
    const schedule = () => {
      clearTimers();
      const t = filmTime();
      const end = filmLength(cuts);
      if (cuts.length > 1) later(markSeen, cuts[1].start - t);
      later(releaseGlobe, globeReleaseAt(cuts) - t);
      later(startLanding, end - t);
    };

    const fastForward = () => {
      if (phase !== 'film') return;
      markSeen();
      releaseGlobe();
      const t = filmTime();
      const target = fastForwardTarget(cuts, t);
      if (target == null) return;
      shiftAll(-(target - t));
      schedule();
    };
    onHurry = fastForward;

    // ── Landing ──
    let landingWaited = 0;
    function startLanding() {
      if (phase !== 'film') return;
      // A moment for the globe's tiles, if they are not in yet.
      const ready = (() => {
        if (phone()) return true;
        try {
          return window.__archiveGlobeReady ? window.__archiveGlobeReady() : true;
        } catch {
          return true;
        }
      })();
      if (!ready && landingWaited < GLOBE_WAIT_MS) {
        landingWaited += 60;
        later(startLanding, 60);
        return;
      }
      phase = 'landing';
      markSeen();
      releaseGlobe();
      state = 'landing';
      publish();
      skip.classList.add('is-gone');
      if (landing === 'b') landB();
      else landA();
    }

    const fadeFurniture = (ms: number) => {
      [finder, hud, grain, vignette].forEach((el) => {
        if (!el) return;
        el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: ms, fill: 'forwards', easing: EASES.fade });
      });
    };

    // A: the words fly home.
    function landA() {
      const slate = rigs[rigs.length - 1];
      const desk = !phone();
      const pairs: { src: HTMLElement; dst: HTMLElement }[] = [];
      const pick = (sel: string) => document.querySelector<HTMLElement>(sel);
      if (desk) {
        (['ryan', 'xu', 'archive', 'travel', 'thought'] as const).forEach((word) => {
          const src = slate.scene.querySelector<HTMLElement>(`[data-fly="${word}"]`);
          const dst = pick(`.globe-prologue [data-open-land="${word}"]`);
          if (src && dst) pairs.push({ src, dst });
        });
      } else {
        // A phone's first screen is the card: his name flies home to it; the
        // other words go with the board (the card's own ARCHIVE is the
        // backdrop behind it — a word landing there would pass in front of
        // the card and then drop behind it).
        const name = slate.scene.querySelector<HTMLElement>('.of-slate__name');
        const nameDst = pick('[data-open-land="phone-name"]');
        if (name && nameDst) pairs.push({ src: name, dst: nameDst });
      }

      overlay.classList.add('is-landing');
      html.setAttribute('data-open-fly', '');
      html.dataset.reel = 'flight';
      fadeFurniture(LANDING_A.furniture[1]);

      const flights = pairs
        .map(({ src, dst }, order) => {
          const srcRect = src.getBoundingClientRect();
          const dstBox = textBox(dst);
          if (!dstBox || !srcRect.width) return null;
          // The source as it is on screen (the clapperboard's camera included).
          const scale = srcRect.height / Math.max(1, src.offsetHeight);
          const srcText = (src.textContent || '').replace(/\s+/g, ' ').trim();
          const srcInk = inkOf(src, srcText);
          const dstText = (dst.textContent || '').trim();
          const dstInk = inkOf(dst, dstText);
          const srcBox: Box = { x: srcRect.left, y: srcRect.top, w: srcRect.width, h: srcRect.height };
          const flight = flightFor(srcBox, dstBox, srcInk.ascent * scale, dstInk.ascent, order);
          return { src, dst, srcText, dstText, srcBox, dstBox, scale, flight };
        })
        .filter(<T,>(x: T | null): x is T => x != null);

      const srcStyle = (el: HTMLElement) => getComputedStyle(el);
      const face = (text: string, style: CSSStyleDeclaration, size: number) => {
        const span = document.createElement('span');
        span.className = 'of-fly__face';
        span.textContent = text;
        span.style.fontFamily = style.fontFamily;
        span.style.fontWeight = style.fontWeight;
        span.style.fontStyle = style.fontStyle;
        span.style.fontSize = `${size}px`;
        span.style.letterSpacing = style.letterSpacing === 'normal' ? 'normal' : `${(parseFloat(style.letterSpacing) * size) / (parseFloat(style.fontSize) || size)}px`;
        span.style.textTransform = style.textTransform;
        span.style.color = style.color;
        span.style.lineHeight = 'normal';
        span.style.fontVariationSettings = style.fontVariationSettings;
        span.style.fontOpticalSizing = (style as CSSStyleDeclaration & { fontOpticalSizing: string }).fontOpticalSizing;
        span.style.fontFeatureSettings = style.fontFeatureSettings;
        span.style.textShadow = style.textShadow;
        return span;
      };

      const built = flights.map(({ src, dst, srcText, dstText, dstBox, scale, flight }) => {
        const wrap = document.createElement('div');
        wrap.className = 'of-fly';
        const cx = dstBox.x + dstBox.w / 2;
        const cy = dstBox.y + dstBox.h / 2;
        wrap.style.transformOrigin = `${cx}px ${cy}px`;
        const sStyle = srcStyle(src);
        const sourceFace = face(srcText, sStyle, ((parseFloat(sStyle.fontSize) || 16) * scale) / flight.k);
        sourceFace.style.textShadow = 'none';
        const dStyle = getComputedStyle(dst);
        const targetFace = face(dstText, dStyle, parseFloat(dStyle.fontSize) || 16);
        wrap.append(sourceFace, targetFace);
        flightLayer.append(wrap);
        return { wrap, sourceFace, targetFace, dstBox, cx, cy, flight };
      });
      // Place the faces (one read each, before anything moves): the target
      // face exactly on the page's own glyphs, the source face centred on
      // them at the size it will have when it lands.
      const placed = built.map((b) => ({ ...b, s: b.sourceFace.getBoundingClientRect(), t: b.targetFace.getBoundingClientRect() }));
      placed.forEach(({ sourceFace, targetFace, dstBox, cx, cy, s, t }) => {
        targetFace.style.transform = `translate3d(${(dstBox.x - t.left).toFixed(2)}px, ${(dstBox.y - t.top).toFixed(2)}px, 0)`;
        sourceFace.style.transform = `translate3d(${(cx - s.width / 2 - s.left).toFixed(2)}px, ${(cy - s.height / 2 - s.top).toFixed(2)}px, 0)`;
      });

      // The clapperboard's words leave it; the board dissolves into the page.
      flights.forEach(({ src }) => {
        src.style.visibility = 'hidden';
      });
      slate.scene.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: LANDING_A.dissolve[1] - LANDING_A.dissolve[0],
        delay: LANDING_A.dissolve[0],
        fill: 'forwards',
        easing: EASES.fade,
      });

      placed.forEach(({ wrap, sourceFace, targetFace, flight }) => {
        const timing = { duration: flight.duration, delay: flight.delay, fill: 'both' as FillMode };
        wrap.animate(
          flightPath(flight).map((k) => ({
            offset: k.offset,
            transform: `translate3d(${k.x.toFixed(2)}px, ${k.y.toFixed(2)}px, 0) scale(${k.s.toFixed(4)})`,
          })),
          { ...timing, easing: 'linear' },
        );
        const [so, sf] = LANDING_A.sourceOut;
        const [ti, tf] = LANDING_A.targetIn;
        sourceFace.animate(
          [
            { offset: 0, opacity: 1, filter: 'blur(0px)' },
            { offset: so, opacity: 1, filter: 'blur(0px)' },
            { offset: sf, opacity: 0, filter: 'blur(5px)' },
            { offset: 1, opacity: 0, filter: 'blur(5px)' },
          ],
          { ...timing, easing: 'linear' },
        );
        targetFace.animate(
          [
            { offset: 0, opacity: 0, filter: 'blur(6px)' },
            { offset: ti, opacity: 0, filter: 'blur(6px)' },
            { offset: tf, opacity: 1, filter: 'blur(0px)' },
            { offset: 1, opacity: 1, filter: 'blur(0px)' },
          ],
          { ...timing, easing: 'linear' },
        );
      });

      later(() => html.setAttribute('data-open-globe', ''), LANDING_A.globe);
      later(() => {
        html.dataset.reel = 'landed';
      }, LANDING_A.rest);
      later(() => {
        // Landed: the page's own words take over on the very frame the
        // clones go.
        html.removeAttribute('data-open-fly');
        flightLayer.replaceChildren();
        unlock();
        detachInput();
      }, landingAEnd(placed.length));
      later(finish, LANDING_A.done);
    }

    // B: through the o.
    function landB() {
      const slate = rigs[rigs.length - 1];
      const o = slate.scene.querySelector<HTMLElement>('[data-portal-o] svg');
      const sheet = slate.sheet;
      const base = o && sheet ? camAt(rigs.length - 1, slate.cut.end) : null;
      if (!o || !sheet || !base) {
        landA();
        return;
      }
      // Take the sheet off its clock: from here the push is drawn frame by
      // frame, in step with the canvas.
      // (The clap's jolt too: the portal is measured on the board at rest.)
      filmAnims
        .filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          return target === sheet || (target === slate.scene && (a.effect as KeyframeEffect).getKeyframes().some((k) => 'transform' in k));
        })
        .forEach((a) => a.cancel());
      sheet.style.transform = cameraTransform(base);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const oRect = o.getBoundingClientRect();
      // The ring: r 42.5 of 50, stroke 12 → the counter is 36.5/50 of the
      // half-width, the ring's outside 48.5/50.
      const half = oRect.width / 2;
      const c0: Vec2 = [oRect.left + half, oRect.top + oRect.height / 2];
      const r0 = (half * 36.5) / 50;
      const ringRatio = 48.5 / 36.5;
      const target = portalTarget(w, h, phone());
      const zoomEnd = target.r / r0;
      const pivot: Vec2 = [(zoomEnd * c0[0] - target.x) / (zoomEnd - 1), (zoomEnd * c0[1] - target.y) / (zoomEnd - 1)];
      // Drawn afresh at every scale (not a bitmap blown up): the letters
      // stay sharp as the camera goes in.
      sheet.style.willChange = 'auto';
      // The counter is a window from the first frame: a hole in the board.
      const ox = (c0[0] - base.tx) / base.s;
      const oy = (c0[1] - base.ty) / base.s;
      const holeR = r0 / base.s;
      const mask = `radial-gradient(circle at ${ox.toFixed(2)}px ${oy.toFixed(2)}px, transparent ${holeR.toFixed(2)}px, #000 ${(holeR + 0.8).toFixed(2)}px)`;
      sheet.style.webkitMaskImage = mask;
      sheet.style.maskImage = mask;
      slate.scene.style.background = 'transparent';
      overlay.classList.add('is-landing');
      html.dataset.reel = 'portal';
      fadeFurniture(200);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      portal.width = Math.round(w * dpr);
      portal.height = Math.round(h * dpr);
      portal.style.visibility = 'visible';
      const ctx = portal.getContext('2d');
      const start = performance.now();
      let raf = 0;
      let risen = false;
      const frame = (now: number) => {
        raf = 0;
        if (disposed) return;
        const t = now - start;
        const u = clamp01(t / LANDING_B.push);
        const p = portalAt(u, c0, r0, target);
        const zoom = p.zoom;
        const cam: Camera = { s: base.s * zoom, tx: pivot[0] + (base.tx - pivot[0]) * zoom, ty: pivot[1] + (base.ty - pivot[1]) * zoom };
        sheet.style.transform = cameraTransform(cam);
        const sheetFade = segment(zoom, LANDING_B.sheetFade[0], LANDING_B.sheetFade[1]);
        sheet.style.opacity = String(1 - sheetFade);
        if (ctx) {
          const surround = 1 - segment(t, LANDING_B.surround[0], LANDING_B.surround[1]);
          const ring = sheetFade * (1 - segment(t, LANDING_B.ring[0], LANDING_B.ring[1]));
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          if (surround > 0) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = surround;
            ctx.fillStyle = '#131511';
            ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'destination-out';
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          if (ring > 0) {
            // The O's own stroke while the board is there; then, as it
            // opens onto the planet, it thins to a hairline round the limb.
            const thin = segment(u, 0.3, 0.9);
            const width = p.r * (ringRatio - 1) * (1 - thin) + 2.5 * thin;
            ctx.globalAlpha = ring;
            ctx.strokeStyle = '#efeee4';
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r + width / 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
        if (!risen && t >= LANDING_B.rise) {
          risen = true;
          html.dataset.reel = 'page';
          unlock();
          detachInput();
        }
        if (t < LANDING_B.done) raf = requestAnimationFrame(frame);
        else {
          portal.style.visibility = 'hidden';
          finish();
        }
      };
      raf = requestAnimationFrame(frame);
      cleanups.push(() => cancelAnimationFrame(raf));
    }

    const cleanups: (() => void)[] = [];

    // ── Go ──
    const begin = () => {
      build();
      schedule();
    };
    // A tab opened in the background plays its film when it is looked at.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || phase !== 'film') return;
      document.removeEventListener('visibilitychange', onVisible);
      const t = nowMs();
      overlay.getAnimations({ subtree: true }).forEach((a) => {
        a.startTime = t;
      });
      t0 = t;
      begin();
    };
    if (document.visibilityState === 'hidden') {
      document.addEventListener('visibilitychange', onVisible);
      overlay.getAnimations({ subtree: true }).forEach((a) => a.pause());
    } else {
      begin();
    }
    // The fonts land after the first paint: measure again (the scenes that
    // use them are well after the first cut).
    let refit = 0;
    const remeasure = () => {
      if (disposed || phase !== 'film') return;
      geometry = measureAll();
      build();
    };
    document.fonts?.ready.then(() => {
      if (!disposed) remeasure();
    });
    const onResize = () => {
      window.clearTimeout(refit);
      refit = window.setTimeout(() => {
        if (disposed || phase !== 'film') return;
        const nextCuts = cutSchedule(phone() ? FILM_PHONE : FILM_DESKTOP);
        if (nextCuts.length !== cuts.length) {
          // Across the phone line: the other film, from where this one is.
          const t = filmTime();
          cuts = nextCuts;
          const to = Math.min(t, filmLength(cuts) - FF_TAIL);
          shiftAll(-(to - t));
          geometry = measureAll();
          build();
          schedule();
          return;
        }
        remeasure();
      }, 160);
    };
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      disposed = true;
      clearTimers();
      detachInput();
      unlock();
      cleanups.forEach((fn) => fn());
      window.clearTimeout(refit);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      filmAnims.forEach((a) => a.cancel());
      flightLayer.replaceChildren();
      html.removeAttribute('data-opening');
      html.removeAttribute('data-open-fly');
      html.removeAttribute('data-open-globe');
      if (html.dataset.reel === 'reel' || html.dataset.reel === 'flight' || html.dataset.reel === 'portal') html.dataset.reel = 'page';
      window.__archiveOpening = undefined;
    };
  }, []);

  const sceneTotal = (n: number) => String(n).padStart(2, '0');
  return (
    <>
      <div ref={rootRef} className="opening" aria-hidden="true">
        <canvas className="of-portal" data-portal />
        <div className="of-stage" data-stage>
          <OpeningScenes />
        </div>
        <div className="of-grain" />
        <div className="of-vignette" />
        <div className="of-finder" data-finder>
          <i className="of-finder__c of-finder__c--tl" />
          <i className="of-finder__c of-finder__c--tr" />
          <i className="of-finder__c of-finder__c--bl" />
          <i className="of-finder__c of-finder__c--br" />
        </div>
        <div className="of-hud">
          <span className="of-hud__rec" />
          <span>
            <span className="of-hud__tc-label">TC </span>00:00:0
            <span className="of-digits of-digits--ss">
              <span className="of-digits__strip">{'0\n1\n2\n3\n4\n5\n6\n7\n8\n9'}</span>
            </span>
            :
            <span className="of-digits of-digits--ff">
              <span className="of-digits__strip">
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).join('\n')}
              </span>
            </span>
          </span>
          <span>
            SC{' '}
            <span className="of-digits of-digits--sc">
              <span className="of-digits__strip">
                {Array.from({ length: FILM_DESKTOP.length }, (_, i) => sceneTotal(i + 1)).join('\n')}
              </span>
            </span>
            <span className="of-hud__total--desk"> / {sceneTotal(FILM_DESKTOP.length)}</span>
            <span className="of-hud__total--phone"> / {sceneTotal(FILM_PHONE.length)}</span>
          </span>
        </div>
        <div className="of-flight" data-flight />
      </div>
      <button ref={skipRef} type="button" className="of-skip" aria-label="Skip the opening film">
        Skip
        <span aria-hidden="true">&rarr;</span>
      </button>
    </>
  );
}
