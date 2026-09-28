import { useEffect, useRef } from 'react';
import OpeningScenes from './OpeningScenes';
import {
  CODE_BEATS,
  ENTRANCES,
  ENTRANCE_SAMPLES,
  FF_RATE,
  FF_TAIL,
  FILM_DESKTOP,
  FILM_PHONE,
  GLOBE_WAIT_MS,
  INPUT_POLICY,
  KICK_EASES,
  LANDING_A,
  LANDING_B,
  OPENING_EVENT,
  PHONE_MAX_WIDTH,
  RAIN_DIM,
  LIFT_EASE,
  SCENE_TONE,
  STILL,
  cameraFor,
  cameraTransform,
  clamp01,
  codeFinderKeys,
  cutSchedule,
  entranceAt,
  fastForwardTarget,
  filmLength,
  finderBox,
  finderLookFrom,
  finderStrength,
  finderTrack,
  flightFor,
  flightPath,
  focusAt,
  globeReleaseAt,
  landingAEnd,
  landingFrom,
  morphScales,
  onScreen,
  portalAt,
  portalTarget,
  ruleFor,
  runProgress,
  segment,
  sheetTransform,
  slateBeats,
  streakAt,
  type Anchor,
  type Box,
  type Camera,
  type Cut,
  type FilmInput,
  type FinderKey,
  type FinderLook,
  type KickEase,
  type Landing,
  type OpeningDetail,
  type OpeningState,
  type Vec2,
} from '../../lib/openingFilm';
import { markReelSeen } from '../../lib/reelVisit';
import { EASE } from '../../lib/motion';
import type { OpeningPicture } from './OpeningScenes';

const bezier = ([a, b, c, d]: readonly number[]) => `cubic-bezier(${a}, ${b}, ${c}, ${d})`;
const EASES = {
  arrive: bezier(EASE.arrive),
  travel: bezier(EASE.travel),
  fade: bezier(EASE.fade),
  leave: bezier(EASE.leave),
  linear: 'linear',
} as const;
// The finder's curves: the hunt between words lands on the house arrive curve
// too (fast off the mark, so a late, short cut is spent on its word); while
// it waits for a shot to land it holds.
const FINDER_EASES = { arrive: EASES.arrive, travel: EASES.arrive, hold: 'linear', linear: 'linear' } as const;
// A scene's kicks, on their named curves.
const KICK_CSS = Object.fromEntries(Object.entries(KICK_EASES).map(([name, curve]) => [name, bezier(curve)])) as Record<KickEase, string>;
// The word jumping off the rain toward the lens: off at once, braked hard.
const LIFT_CSS = bezier(LIFT_EASE);
// The two faces' shared width across landing A's morph: one curve for both.
const MORPH_EASE = 'cubic-bezier(0.45, 0, 0.55, 1)';
// The finder's padding round a word, px (on a phone a little less).
const FINDER_PAD = { desktop: 16, phone: 10 } as const;
// The rule is drawn 100 px long and scaled to the word (a transform only).
const RULE_UNIT = 100;

interface Measured {
  /** The word's centre and cap height in its sheet (sheet px). */
  anchor: Anchor;
  /** Its ink box in the sheet. */
  ink: Box;
  /** Its cap box (ascent to baseline, no descenders): the rule sits under
   *  it, so a word's rule does not drop when the next scene's face has a
   *  descender. */
  cap: Box;
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
  if (inkText === 'box' && find.dataset.cap) {
    // A word set in several faces at once (the slices): its cells' box across,
    // its baseline from the probe, its cap height given.
    const cap = Number(find.dataset.cap) || 64;
    const box = { x: at.x, y: baseline - cap, w: find.offsetWidth, h: cap };
    return { anchor: { x: box.x + box.w / 2, y: baseline - cap / 2, cap }, ink: box, cap: box };
  }
  if (inkText === 'box') {
    const box = { x: at.x, y: at.y, w: find.offsetWidth, h: find.offsetHeight };
    // The tiles' own letters give the size to match.
    const letter = find.querySelector<HTMLElement>('.of-flap') ?? find;
    const cap = inkOf(letter, text).ascent;
    return { anchor: { x: box.x + box.w / 2, y: box.y + box.h / 2, cap }, ink: box, cap: box };
  }
  const box = { x: at.x - ink.left, y: baseline - ink.ascent, w: ink.left + ink.right, h: ink.ascent + ink.descent };
  return {
    anchor: { x: box.x + box.w / 2, y: baseline - ink.ascent / 2, cap: ink.ascent },
    ink: box,
    cap: { x: box.x, y: baseline - ink.ascent, w: box.w, h: ink.ascent },
  };
}

/** Where an element's baseline is on screen: a zero-size probe on its last
 *  line, read once (the landings measure their words this way, before
 *  anything moves). */
function baselineOf(el: HTMLElement) {
  const probe = document.createElement('i');
  probe.className = 'of-bl';
  el.append(probe);
  const y = probe.getBoundingClientRect().top;
  probe.remove();
  return y;
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
 * from the same start as the CSS. Every shot cuts in hard and makes one
 * short move (its entrance: a transform on its sheet about the found word,
 * sampled into keyframes) and its own kicks (the dial, the rings, the
 * slices, the flaps), then holds. The page's scroll is held (body overflow:
 * clip, the one lock the sticky atlas survives); a wheel, a touch, a key or
 * a click does nothing else — only the Skip pill skips, to the clapperboard
 * and the landing.
 *
 * It plays once a tab session (src/lib/reelVisit.ts decides before the first
 * paint: html[data-opening] present means it plays).
 */
export default function OpeningFilm({ pictures = [] }: { pictures?: readonly OpeningPicture[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const overlayEl = rootRef.current;
    const skipEl = skipRef.current;
    const html = document.documentElement;
    if (!overlayEl || !skipEl) return;
    // (Typed non-null: the landings are function declarations, which keep no
    // narrowing.)
    const overlay: HTMLDivElement = overlayEl;
    const skip: HTMLButtonElement = skipEl;
    if (!html.hasAttribute('data-opening') || html.dataset.reel === 'skip') return;

    const body = document.body;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const landing: Landing = landingFrom(window.location.search);
    const look: FinderLook = finderLookFrom(window.location.search);
    const stage = overlay.querySelector<HTMLElement>('[data-stage]')!;
    const finder = overlay.querySelector<HTMLElement>('[data-finder]')!;
    finder.dataset.look = look;
    const corners = Array.from(finder.querySelectorAll<HTMLElement>('.of-finder__c'));
    const rule = finder.querySelector<HTMLElement>('.of-finder__rule');
    const flightLayer = overlay.querySelector<HTMLElement>('[data-flight]')!;
    const portal = overlay.querySelector<HTMLCanvasElement>('[data-portal]')!;
    const hud = overlay.querySelector<HTMLElement>('.of-hud');
    const grain = overlay.querySelector<HTMLElement>('.of-grain');
    const vignette = overlay.querySelector<HTMLElement>('.of-vignette');

    let disposed = false;
    let state: OpeningState = 'film';
    let globe = false;
    let phase: 'film' | 'landing' | 'done' = 'film';
    // The reader pressed Skip: the landing plays at FF_RATE.
    let hurried = false;
    // Landing A's globe keeps its rise after the page is handed over.
    let globeSettle = 0;
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
      // (The globe's rise, if landing A started it, runs to its end first:
      // dropping the attribute takes its transition away.)
      if (html.hasAttribute('data-open-globe')) {
        globeSettle = window.setTimeout(() => html.removeAttribute('data-open-globe'), 700);
      }
      skip.classList.remove('is-gone');
      state = 'page';
      globe = true;
      publish();
      // The film's animations are done with; free their layers.
      overlay.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      flightLayer.replaceChildren();
    };

    // ── Input: only the Skip pill skips ──
    // (src/lib/openingFilm.ts INPUT_POLICY.) A wheel, a drag or a scrolling
    // key is held — the page must not scroll under the film — and that is
    // all; a click anywhere but the pill does nothing. The pill is a real
    // button: Tab reaches it, and Enter and Space press it.
    let onSkipFilm: () => void = () => {};
    const input = (source: FilmInput) => {
      if (INPUT_POLICY[source] === 'skip') onSkipFilm();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      input('wheel');
    };
    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      input('touch');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // The browser's own keys (shortcuts, F-keys) and Tab (to reach the
      // pill) are left alone.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Tab' || /^F\d{1,2}$/.test(event.key)) return;
      // The pill's own keys press it (at once, on the key going down).
      if (event.target === skip && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) {
        event.preventDefault();
        input('skip');
        return;
      }
      // Anything else does nothing — no scroll, no default action at all.
      event.preventDefault();
      input('key');
    };
    const onSkip = (event: MouseEvent) => {
      event.preventDefault();
      input('skip');
    };
    let inputAttached = false;
    const attachInput = () => {
      if (inputAttached) return;
      inputAttached = true;
      window.addEventListener('wheel', onWheel, { capture: true, passive: false });
      window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      window.addEventListener('keydown', onKeyDown, { capture: true });
      skip.addEventListener('click', onSkip);
    };
    const detachInput = () => {
      if (!inputAttached) return;
      inputAttached = false;
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('touchmove', onTouchMove, { capture: true });
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
      onSkipFilm = fade;
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

    const measureAll = (): { cap: number; archiveFocus: Vec2; lockInk: Box; lockCap: Box; lockCentre: Vec2 } => {
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
      const lockCap: Box = { x: lockInk.x, y: baseline - ink.ascent, w: lockInk.w, h: ink.ascent };
      // The locked word scales about its own box's centre: the lock point.
      const lockCentre: Vec2 = [lx, ly];
      const cap = ink.ascent;
      const archiveFocus: Vec2 = [lockInk.x + lockInk.w / 2, baseline - ink.ascent / 2];
      rigs = cuts.map((cut) => {
        const scene = stage.querySelector<HTMLElement>(`[data-scene="${cut.id}"]`)!;
        const sheet = scene.querySelector<HTMLElement>('[data-sheet]');
        const find = sheet?.querySelector<HTMLElement>('[data-find]');
        return { cut, scene, sheet, measured: sheet && find ? measureFind(find, sheet) : null };
      });
      return { cap, archiveFocus, lockInk, lockCap, lockCentre };
    };

    let geometry = measureAll();
    let finderFrom: number | null = null;

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

      // ── Cuts, cameras, entrances and kicks ──
      // Every cut is hard (opacity steps on the frame). Each shot's sheet
      // carries its camera and, on top of it, its entrance about the found
      // word (sampled, so the curve is the entrance's own and the camera's
      // push stays exact under it); a whip adds a streak plate; a rack focus a
      // blur; and the scene's own kicks play on the same clock.
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const whips: Cut[] = [];
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

        // The scene's own life: each kick FROM its transform TO its rest.
        rig.scene.querySelectorAll<HTMLElement>('[data-kick]').forEach((el) => {
          const d = el.dataset;
          const from = d.from || 'none';
          const to = d.to || 'none';
          const t1 = cut.start + (Number(d.at) || 0);
          const t2 = t1 + (Number(d.ms) || 200);
          const ease = KICK_CSS[(d.ease ?? 'lock') as KickEase] ?? KICK_CSS.lock;
          const op = d.op != null && d.op !== '' ? Number(d.op) : null;
          const frame = (offset: number, transform: string, o: number | null, easing?: string): Keyframe => ({
            offset,
            transform,
            ...(o != null ? { opacity: o } : {}),
            ...(easing ? { easing } : {}),
          });
          play(el, [frame(0, from, op), frame(at(t1), from, op, ease), frame(at(t2), to, op != null ? 1 : null), frame(1, to, op != null ? 1 : null)]);
        });

        if (i === 0 || !rig.sheet || !rig.measured) return;
        const entrance = ENTRANCES[cut.id];
        // The entrance turns about where the word comes to rest.
        const f = focusAt(cuts, i, cut.start + entrance.ms, vw, vh, phone(), geometry.archiveFocus);
        rig.scene.style.perspectiveOrigin = `${f[0].toFixed(1)}px ${f[1].toFixed(1)}px`;
        // Only a swing turns in depth; the other shots stay flat (a flat
        // sheet needs no surface of its own to be drawn through).
        const depth = !!(entrance.rx || entrance.ry);
        const sheetAt = (t: number, u: number) => sheetTransform(camAt(i, t)!, entranceAt(entrance, u, vw, vh), f, depth);
        const frames: Keyframe[] = [{ offset: 0, transform: sheetAt(cut.start, 0) }];
        const blur: Keyframe[] = [];
        if (entrance.ms > 0) {
          for (let k = 0; k <= ENTRANCE_SAMPLES; k += 1) {
            const u = k / ENTRANCE_SAMPLES;
            const t = cut.start + entrance.ms * u;
            frames.push({ offset: at(t), transform: sheetAt(t, u) });
            if (entrance.blur) blur.push({ offset: at(t), filter: `blur(${entranceAt(entrance, u, vw, vh).blur.toFixed(2)}px)` });
          }
        }
        frames.push({ offset: at(cut.end), transform: sheetAt(cut.end, 1) }, { offset: 1, transform: sheetAt(cut.end, 1) });
        play(rig.sheet, frames);
        if (blur.length) {
          play(rig.sheet, [{ offset: 0, filter: 'blur(0px)' }, { offset: at(cut.start), filter: 'blur(0px)' }, ...blur, { offset: 1, filter: 'blur(0px)' }]);
        }
        if (entrance.kind === 'whip') whips.push(cut);
      });

      // The whips' motion blur: a streak plate in the incoming shot's tone,
      // as dense as the move is fast.
      overlay.querySelectorAll<HTMLElement>('[data-whip]').forEach((plate) => {
        const tone = plate.dataset.whip;
        const mine = whips.filter((cut) => SCENE_TONE[cut.id] === tone);
        if (!mine.length) return;
        const frames: Keyframe[] = [{ offset: 0, opacity: 0 }];
        mine.forEach((cut) => {
          const entrance = ENTRANCES[cut.id];
          frames.push({ offset: at(cut.start), opacity: 0 });
          for (let k = 0; k <= ENTRANCE_SAMPLES; k += 1) {
            const u = k / ENTRANCE_SAMPLES;
            frames.push({ offset: at(cut.start + entrance.ms * u), opacity: k === ENTRANCE_SAMPLES ? 0 : streakAt(u) });
          }
        });
        frames.push({ offset: 1, opacity: 0 });
        play(plate, frames);
      });

      // ── Scene one: the word lifts off the rain; the rain dims and pushes ──
      const code = rigs[0];
      const lockWord = code.scene.querySelector<HTMLElement>('.of-lock__word');
      const lockCells = code.scene.querySelector<HTMLElement>('.of-lock__cells');
      const rain = code.scene.querySelector<HTMLElement>('[data-rain]');
      const k0 = getComputedStyle(overlay).getPropertyValue('--of-k0').trim() || '0.3';
      const lifted = (k: string) => `translate(-50%, -50%) scale(${k})`;
      const [liftA, liftB] = CODE_BEATS.lift;
      if (lockWord) {
        play(lockWord, [
          { offset: 0, transform: lifted(k0) },
          { offset: at(liftA), transform: lifted(k0), easing: LIFT_CSS },
          { offset: at(liftB), transform: lifted('1') },
          { offset: 1, transform: lifted('1') },
        ]);
      }
      if (lockCells) {
        play(lockCells, [
          { offset: 0, transform: lifted(k0), opacity: 1 },
          { offset: at(liftA), transform: lifted(k0), opacity: 1, easing: LIFT_CSS },
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
      // Its track is boxes (the word's box + pad, per scene start and end);
      // the look draws them: four corners (?finder=frame, the word's ink box)
      // or the reading rule (its cap box, growing only sideways).
      const pad = FINDER_PAD[phone() ? 'phone' : 'desktop'];
      const vy = look === 'rule' ? 0 : 1;
      const wordBox = (m: Measured) => (look === 'rule' ? m.cap : m.ink);
      const lockBox = look === 'rule' ? geometry.lockCap : geometry.lockInk;
      const boxes: [Box, Box][] = rigs.map((rig, i) => {
        const fallback = finderBox(lockBox, pad);
        if (i === 0) return [fallback, fallback];
        const a = camAt(i, rig.cut.start);
        const b = camAt(i, rig.cut.end);
        if (!a || !b || !rig.measured) return [fallback, fallback];
        return [finderBox(onScreen(wordBox(rig.measured), a), pad), finderBox(onScreen(wordBox(rig.measured), b), pad)];
      });
      const [finderA, finderB] = CODE_BEATS.finder;
      const keys: FinderKey[] = [
        ...codeFinderKeys(lockBox, geometry.lockCentre[0], geometry.lockCentre[1], parseFloat(k0) || 0.3, pad, vy),
        ...finderTrack(cuts, boxes, finderB, vy),
      ];
      const track = (el: HTMLElement, place: (box: Box) => string) => {
        const frames: Keyframe[] = [];
        let lastOffset = 0;
        keys.forEach((key) => {
          const offset = Math.max(lastOffset, at(key.t));
          lastOffset = offset;
          frames.push({ offset, transform: place(key.box), easing: FINDER_EASES[key.ease] });
        });
        frames.push({ offset: 1, transform: place(keys[keys.length - 1].box) });
        frames[0].offset = 0;
        play(el, frames);
      };
      if (look === 'rule' && rule) {
        track(rule, (box) => {
          const r = ruleFor(box, pad);
          return `translate3d(${r.x.toFixed(2)}px, ${r.y.toFixed(2)}px, 0) scaleX(${(r.w / RULE_UNIT).toFixed(4)})`;
        });
      } else {
        const arm = corners[0]?.offsetWidth || 22;
        corners.forEach((corner, which) =>
          track(corner, (box) => {
            const x = which % 2 === 0 ? box.x : box.x + box.w - arm;
            const y = which < 2 ? box.y : box.y + box.h - arm;
            return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
          }),
        );
      }
      // It comes up round the scrambling letters (or at once, if the island
      // came up later than that: from where the film is, never a pop).
      if (finderFrom == null) finderFrom = Math.max(finderA, filmTime());
      play(finder, [
        { offset: 0, opacity: 0 },
        { offset: at(finderFrom), opacity: 0 },
        { offset: at(finderFrom + 140), opacity: 1 },
        { offset: 1, opacity: 1 },
      ]);
      // Dim while a shot moves, full once it locks on.
      const strength: Keyframe[] = [{ offset: 0, opacity: 1 }, ...finderStrength(cuts).map((k) => ({ offset: at(k.t), opacity: k.o })), { offset: 1, opacity: 1 }];
      Array.from(finder.children).forEach((mark) => play(mark, strength.map((k) => ({ ...k }))));

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

    // The Skip pill: to the clapperboard's tail, and a hurried landing.
    const fastForward = () => {
      if (phase !== 'film') return;
      hurried = true;
      markSeen();
      releaseGlobe();
      const t = filmTime();
      const target = fastForwardTarget(cuts, t);
      if (target == null) return;
      shiftAll(-(target - t));
      schedule();
    };
    onSkipFilm = fastForward;

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
      // Hurried (the reader wheeled, touched, pressed): every beat at FF_RATE.
      const rate = hurried ? FF_RATE : 1;
      const ms = (v: number) => v / rate;
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
      fadeFurniture(ms(LANDING_A.furniture[1]));

      // Every word measured once, before anything moves: where its ink is
      // on the board (centre, cap height) and where its ink will be on the
      // page. The flight goes from ink centre to ink centre.
      const flights = pairs
        .map(({ src, dst }, order) => {
          const srcRect = src.getBoundingClientRect();
          const dstBox = textBox(dst);
          if (!dstBox || !srcRect.width) return null;
          // The source as it is on screen (the clapperboard's camera included).
          const scale = srcRect.height / Math.max(1, src.offsetHeight);
          const srcText = (src.textContent || '').replace(/\s+/g, ' ').trim();
          const srcInk = inkOf(src, srcText);
          const srcBase = baselineOf(src);
          const dstText = (dst.textContent || '').trim();
          const dstInk = inkOf(dst, dstText);
          const dstBase = baselineOf(dst);
          const from: Vec2 = [srcRect.left + (scale * (srcInk.right - srcInk.left)) / 2, srcBase - (scale * srcInk.ascent) / 2];
          const to: Vec2 = [dstBox.x + (dstInk.right - dstInk.left) / 2, dstBase - dstInk.ascent / 2];
          const flight = flightFor({ x: from[0], y: from[1], w: 0, h: 0 }, { x: to[0], y: to[1], w: 0, h: 0 }, srcInk.ascent * scale, dstInk.ascent, order);
          return { src, dst, srcText, dstText, dstBox, dstBase, scale, to, flight };
        })
        .filter(<T,>(x: T | null): x is T => x != null);

      // A face: a positioned box holding the word on an inline-block (the
      // morph's horizontal scale goes on that inner span, the placement on
      // the box), with a baseline probe.
      const face = (text: string, style: CSSStyleDeclaration, size: number) => {
        const box = document.createElement('span');
        box.className = 'of-fly__face';
        const inner = document.createElement('span');
        inner.className = 'of-fly__ink';
        inner.textContent = text;
        const probe = document.createElement('i');
        probe.className = 'of-bl';
        inner.append(probe);
        box.append(inner);
        inner.style.fontFamily = style.fontFamily;
        inner.style.fontWeight = style.fontWeight;
        inner.style.fontStyle = style.fontStyle;
        inner.style.fontSize = `${size}px`;
        inner.style.letterSpacing = style.letterSpacing === 'normal' ? 'normal' : `${(parseFloat(style.letterSpacing) * size) / (parseFloat(style.fontSize) || size)}px`;
        inner.style.textTransform = style.textTransform;
        inner.style.color = style.color;
        inner.style.lineHeight = 'normal';
        inner.style.fontVariationSettings = style.fontVariationSettings;
        inner.style.fontOpticalSizing = (style as CSSStyleDeclaration & { fontOpticalSizing: string }).fontOpticalSizing;
        inner.style.fontFeatureSettings = style.fontFeatureSettings;
        inner.style.textShadow = style.textShadow;
        return { box, inner, probe };
      };

      const built = flights.map(({ src, dst, srcText, dstText, to, scale, flight }) => {
        const wrap = document.createElement('div');
        wrap.className = 'of-fly';
        wrap.style.transformOrigin = `${to[0]}px ${to[1]}px`;
        const sStyle = getComputedStyle(src);
        // The board's face at the size it has once landed (its cap = the
        // page's): the wrap's scale takes it back to the board's on screen.
        const source = face(srcText, sStyle, ((parseFloat(sStyle.fontSize) || 16) * scale) / flight.k);
        source.inner.style.textShadow = 'none';
        const dStyle = getComputedStyle(dst);
        const target = face(dstText, dStyle, parseFloat(dStyle.fontSize) || 16);
        wrap.append(source.box, target.box);
        flightLayer.append(wrap);
        return { wrap, source, target, srcText, dstText, flight };
      });
      // Place the faces (one read each, before anything moves): the page's
      // face exactly on the page's own glyphs, the board's face with its ink
      // centred on the same point and its baseline where their cap heights
      // share a middle — the one ink box both are held to.
      const placed = built.map((b, i) => {
        const { dstBox, dstBase } = flights[i];
        const sRect = b.source.box.getBoundingClientRect();
        const sBase = b.source.probe.getBoundingClientRect().top;
        const tRect = b.target.box.getBoundingClientRect();
        const tBase = b.target.probe.getBoundingClientRect().top;
        const sInk = inkOf(b.source.inner, b.srcText);
        const tInk = inkOf(b.target.inner, b.dstText);
        const [cx, cy] = flights[i].to;
        b.target.box.style.transform = `translate3d(${(dstBox.x - tRect.left).toFixed(2)}px, ${(dstBase - tBase).toFixed(2)}px, 0)`;
        const sx = cx - (sInk.right - sInk.left) / 2 - sRect.left;
        const sy = cy + sInk.ascent / 2 - sBase;
        b.source.box.style.transform = `translate3d(${sx.toFixed(2)}px, ${sy.toFixed(2)}px, 0)`;
        // Each face's morph scales about its own ink centre (= the shared one).
        b.source.inner.style.transformOrigin = `${((sInk.right - sInk.left) / 2).toFixed(2)}px 50%`;
        b.target.inner.style.transformOrigin = `${((tInk.right - tInk.left) / 2).toFixed(2)}px 50%`;
        return { ...b, morph: morphScales(sInk.left + sInk.right, tInk.left + tInk.right) };
      });

      // The clapperboard's words leave it; the board dissolves into the page.
      flights.forEach(({ src }) => {
        src.style.visibility = 'hidden';
      });
      slate.scene.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: ms(LANDING_A.dissolve[1] - LANDING_A.dissolve[0]),
        delay: ms(LANDING_A.dissolve[0]),
        fill: 'forwards',
        easing: EASES.fade,
      });

      const [m0, m1] = LANDING_A.morph;
      placed.forEach(({ wrap, source, target, flight, morph }) => {
        const timing = { duration: ms(flight.duration), delay: ms(flight.delay), fill: 'both' as FillMode, easing: 'linear' };
        wrap.animate(
          flightPath(flight).map((k) => ({
            offset: k.offset,
            transform: `translate3d(${k.x.toFixed(2)}px, ${k.y.toFixed(2)}px, 0) scale(${k.s.toFixed(4)})`,
          })),
          timing,
        );
        // One ink width for both faces at every moment (board's → page's).
        const widths = (from: number, to: number): Keyframe[] => [
          { offset: 0, transform: `scaleX(${from.toFixed(4)})` },
          { offset: m0, transform: `scaleX(${from.toFixed(4)})`, easing: MORPH_EASE },
          { offset: m1, transform: `scaleX(${to.toFixed(4)})` },
          { offset: 1, transform: `scaleX(${to.toFixed(4)})` },
        ];
        source.inner.animate(widths(morph.source[0], morph.source[1]), timing);
        target.inner.animate(widths(morph.target[0], morph.target[1]), timing);
        // …and one crossfade window, no blur: the letterforms turn.
        const [so, sf] = LANDING_A.sourceOut;
        const [ti, tf] = LANDING_A.targetIn;
        source.box.animate(
          [
            { offset: 0, opacity: 1 },
            { offset: so, opacity: 1 },
            { offset: sf, opacity: 0 },
            { offset: 1, opacity: 0 },
          ],
          timing,
        );
        target.box.animate(
          [
            { offset: 0, opacity: 0 },
            { offset: ti, opacity: 0 },
            { offset: tf, opacity: 1 },
            { offset: 1, opacity: 1 },
          ],
          timing,
        );
      });

      later(() => html.setAttribute('data-open-globe', ''), ms(LANDING_A.globe));
      later(() => {
        html.dataset.reel = 'landed';
      }, ms(LANDING_A.rest));
      later(() => {
        // Landed: the page's own words take over on the very frame the
        // clones go.
        html.removeAttribute('data-open-fly');
        flightLayer.replaceChildren();
        unlock();
        detachInput();
      }, ms(landingAEnd(placed.length)));
      later(finish, ms(LANDING_A.done));
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
      const onPhone = phone();
      const target = portalTarget(w, h, onPhone);
      // Hurried (the reader wheeled, touched, pressed): the push at FF_RATE.
      const rate = hurried ? FF_RATE : 1;
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
      fadeFurniture(200 / rate);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      portal.width = Math.round(w * dpr);
      portal.height = Math.round(h * dpr);
      portal.style.visibility = 'visible';
      const ctx = portal.getContext('2d');
      const start = performance.now();
      let raf = 0;
      let risen = false;
      // The ground round the window starts as the board's own dark and
      // warms to the page's olive as the camera goes in.
      const ground0 = [0x1b, 0x1e, 0x16];
      const ground1 = [0x28, 0x2c, 0x20];
      const frame = (now: number) => {
        raf = 0;
        if (disposed) return;
        const t = (now - start) * rate;
        const u = clamp01(t / LANDING_B.push);
        const p = portalAt(u, c0, r0, target);
        const zoom = p.zoom;
        const cam: Camera = { s: base.s * zoom, tx: pivot[0] + (base.tx - pivot[0]) * zoom, ty: pivot[1] + (base.ty - pivot[1]) * zoom };
        sheet.style.transform = cameraTransform(cam);
        const sheetFade = segment(zoom, LANDING_B.sheetFade[0], LANDING_B.sheetFade[1]);
        sheet.style.opacity = String(1 - sheetFade);
        if (ctx) {
          const surround = 1 - segment(t, LANDING_B.surround[0], LANDING_B.surround[1]);
          const ring = sheetFade * (1 - segment(t, LANDING_B.ringOut[0], LANDING_B.ringOut[1]));
          const warm = segment(u, 0, 0.5);
          const ground = `rgb(${ground0.map((c, i) => Math.round(c + (ground1[i] - c) * warm)).join(',')})`;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          if (surround > 0) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = surround;
            ctx.fillStyle = ground;
            ctx.fillRect(0, 0, w, h);
            // A phone's window opens on its card, whose own letters would
            // show through the O: its window stays olive until the iris.
            ctx.globalCompositeOperation = 'destination-out';
            ctx.globalAlpha = onPhone ? sheetFade : 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          if (ring > 0) {
            // A white-ink hairline at the counter's edge, one weight at any
            // scale; it takes over from the O's own stroke as the board goes.
            ctx.globalAlpha = ring;
            ctx.strokeStyle = '#efeee4';
            ctx.lineWidth = LANDING_B.ring;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r + LANDING_B.ring / 2, 0, Math.PI * 2);
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

    // ── His photographs, for the magazine's picture page and the strip of
    // film: fetched after the first paint at low priority (those scenes are
    // seconds in); until one has arrived and decoded, its scene keeps the
    // drawn stand-in.
    const pictureTimer = window.setTimeout(() => {
      if (disposed) return;
      overlay.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => {
        const src = img.dataset.src;
        if (!src || img.getAttribute('src')) return;
        img.decoding = 'async';
        (img as HTMLImageElement & { fetchPriority: string }).fetchPriority = 'low';
        img.addEventListener(
          'load',
          () => {
            const show = () => {
              if (disposed) return;
              img.classList.add('is-in');
              img.parentElement?.classList.add('has-pic');
            };
            (img.decode ? img.decode() : Promise.resolve()).then(show, show);
          },
          { once: true },
        );
        img.src = src;
      });
    }, 200);
    cleanups.push(() => window.clearTimeout(pictureTimer));

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
      window.clearTimeout(globeSettle);
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

  return (
    <>
      <div ref={rootRef} className="opening" aria-hidden="true">
        <canvas className="of-portal" data-portal />
        <div className="of-stage" data-stage>
          <OpeningScenes pictures={pictures} />
        </div>
        {/* A whip's motion blur: streak plates, one per tone. */}
        <div className="of-whip of-whip--light" data-whip="light" />
        <div className="of-whip of-whip--dark" data-whip="dark" />
        <div className="of-grain" />
        <div className="of-vignette" />
        <div className="of-finder" data-finder>
          <i className="of-finder__rule" />
          <i className="of-finder__c of-finder__c--tl" />
          <i className="of-finder__c of-finder__c--tr" />
          <i className="of-finder__c of-finder__c--bl" />
          <i className="of-finder__c of-finder__c--br" />
        </div>
        {/* The timecode only: a film's running clock, not a progress count. */}
        <div className="of-hud">
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
