import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cubicBezier, motion, useTransform, type MotionValue } from 'framer-motion';
import { EASE } from '../../lib/motion';
// The leg's distance: the one rule /about's route figure also reads.
import { formatKm, haversineKm } from '../../lib/geo';
import { pad2, stateCode } from '../../lib/routeShield';
import { stockPaper } from '../../lib/ticketStock';
import { railBox } from '../../lib/coverDock';
import { MapShield } from './RouteShield';
import { Bi, T, useLang } from '../../i18n/react';
import { tr } from '../../i18n/dict';
import type { Lang } from '../../i18n/lang';

/** Everything the sign prints for a place. */
export interface ViewfinderPlace {
  id: string;
  name: string;
  /** Its printed Chinese twin (the leg readout in 中). */
  nameZh?: string;
  /** 1-based chapter number. */
  number: number;
  total: number;
  year?: number | string;
  frames: number;
  region?: string;
  /** [longitude, latitude] */
  coordinates: [number, number];
}

/** A shield on the map as drawn this camera frame, in the atlas's px. */
export interface ShieldBox {
  /** The place's id: frame to frame, how fast its shield moves. */
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ViewfinderHandle {
  /** Show a place at rest, with no animation (first draw, restores, reduced motion). */
  settle(place: ViewfinderPlace): void;
  /**
   * The shields the readouts must not print over (every one in view),
   * handed over by the atlas on each camera frame it places them
   * (RouteAtlas `placeShields`).
   */
  avoid(boxes: readonly ShieldBox[]): void;
  /**
   * The camera has taken off toward `to`: the sign reads the flight until
   * `lockAt` (a performance.now() timestamp — the flight's touchdown), then
   * locks. Calling it again mid-flight retargets: same flight, new subject and
   * lock time.
   */
  hunt(to: ViewfinderPlace, lockAt: number): void;
  /**
   * Where the camera's focal point is (the atlas's px): each chapter's place
   * stands where its cover fits beside it (src/lib/coverDock.ts), so the
   * readouts follow the camera's padding as it moves from place to place.
   */
  focal(point: { x: number; y: number }): void;
}

// Geometry, measured from the atlas focal point (the place the camera rests on).
const ARM = 168;
const META_TOP = 84;
// The leg's other line: above the current stop's shield (34 × 1.4 × the
// tallest form's 1.08 ≈ 51px over the place, its landing accent ≈ 56), for a
// landing whose shield below the place would sit under the line below.
const META_ABOVE = 66;
// The readouts' boxes, DERIVED from their text (never measured: they are
// set every frame of a flight): the label face at 10px, 0.08em tracking,
// measured 6.4px a character, 10px a line; the leg's dot and its gap 14px.
const READOUT_CHAR_PX = 6.4;
const READOUT_LINE_PX = 10;
const META_DOT_PX = 14;
/** A readout this close to a shield (px) steps back from it. */
const YIELD_PAD = 6;
// A readout keeps this far inside the window's edge, or steps back.
const EDGE_PX = 12;
/** The readouts' step back (global.css `.viewfinder__yield[data-yield]`,
 *  --dur-in on the fade curve): the leg moves to its other line only once it
 *  has gone. */
const YIELD_OUT_MS = 200;
/** A shield in motion (a flight) is met where it will be this far ahead, so
 *  a readout has stepped back by the time the shield reaches it — as far as
 *  YIELD_SWEEP_PX ahead: a faster shield crosses a 10px line in a frame or
 *  two, and a longer reach would empty the instruments mid-flight. Its speed
 *  is DERIVED from the boxes the atlas hands over frame to frame. */
const YIELD_LEAD_MS = 200;
const YIELD_SWEEP_PX = 80;
/** Where the archive reads: the line a chapter's cover photograph sits on
 *  (HomePage scrolls a chapter to it), and therefore the line the map's focal
 *  point and this sign must share — otherwise the sign reads out a place
 *  40-odd pixels below the photograph it belongs to. */
export const ATLAS_READING_LINE = 0.48;

/** The lock settles (the leg's distance landing) over this long. */
const SETTLE_MS = 510;
const MIN_HUNT_MS = 600;
/** After the landing the report holds this long and then steps back
 *  (global.css, "The instruments on demand"): landed, the chapter reads as
 *  the place's sign on the map, the ticket, the name and the lede. */
const REPORT_HOLD_MS = 1700;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const progress = (a: number, b: number, value: number) => clamp((value - a) / (b - a));
/** A to B on a clock: the coordinates count across (and the leg's distance
 *  with them) on the site's travel curve, as the needle and the closing's
 *  square travel. */
const travelEase = cubicBezier(...EASE.travel);

/** Writes a readout's text into the text node it already has (a changed
 *  string, no new node): `textContent =` put a new text node in the tree on
 *  every frame of a flight, and each insertion made the browser re-check the
 *  whole atlas for its `:has()` rules — the whole map's DOM restyled three
 *  times a frame. */
function setText(element: HTMLElement | null | undefined, text: string) {
  if (!element) return;
  const node = element.firstChild;
  if (node && node.nodeType === 3 && !node.nextSibling) {
    if (node.nodeValue !== text) node.nodeValue = text;
    return;
  }
  element.textContent = text;
}

// The readouts in the page's language (北纬 25.7617° in 中: the hemisphere
// before the figure).
const latitudeLabel = (latitude: number, lang: Lang) => tr(lang, latitude >= 0 ? 'coord.n' : 'coord.s', { v: Math.abs(latitude).toFixed(4) });
const longitudeLabel = (longitude: number, lang: Lang) => tr(lang, longitude >= 0 ? 'coord.e' : 'coord.w', { v: Math.abs(longitude).toFixed(4) });
const kmLabel = (km: string, lang: Lang) => tr(lang, 'sign.km', { km });
const placeName = (place: ViewfinderPlace, lang: Lang) => (lang === 'zh' && place.nameZh) || place.name;
/** A readout's width in Latin characters: a Han character sets about two. */
const HAN_CHAR = /\p{Script=Han}/u;
function readoutChars(text: string | null | undefined) {
  let n = 0;
  for (const ch of text ?? '') n += HAN_CHAR.test(ch) ? 2 : 1;
  return n;
}

/**
 * AtlasSign — what the map says about a trip, set around the focal point in
 * the plainest instrument type it can: the latitude and longitude out at the
 * ends of the reading line, and, for a flight, one line below it carrying the
 * leg — where from, where to, and the kilometres covered.
 *
 * It does not name the place. The place is signed twice already, and both
 * signs are the same route shield: on the map, where it stands on the place
 * (PlaceShield), and on the chapter's ticket, whose stub IS the place's sign —
 * its state, its stop number and its name, turning into place on the landing
 * (owner, 2026-09-28: 将右侧的大号封面和路牌上方的州名缩写+地名和第几站结合在一起).
 * So the year and the "03 / 06 · REGION · FRAMES" line this used to print on
 * landing are gone: the ticket prints them, a few centimetres away.
 *
 * All drawing is imperative inside one rAF loop that runs only while something
 * moves; React renders once. It is instrument type, so it is not printed at
 * rest: the readouts sit in one layer, `.viewfinder__instruments`, which
 * REPORTS a trip — from take-off, through the landing, for REPORT_HOLD_MS —
 * and then steps back. A settle onto a different place (reduced motion, a
 * restart) is an arrival too and reports the same way; a settle on the place
 * already shown stays quiet. The atlas brings the layer up as well while a
 * hand moves over the map (`data-atlas-look`).
 */
export const AtlasViewfinder = forwardRef<ViewfinderHandle, {
  initial: ViewfinderPlace | null;
  visibility: MotionValue<number>;
  reducedMotion: boolean;
  /** Where the scrim is drawn once the map is up: the map's own ground, under
   *  the places' ink (RouteAtlas `inkGround`). Until then it is drawn here. */
  scrimHost?: HTMLElement | null;
  /** How far that ground's origin sits outside the atlas (the canvas bleed). */
  bleed?: number;
}>(function AtlasViewfinder({ initial, visibility, reducedMotion, scrimHost = null, bleed = 0 }, forwardedRef) {
  const rootRef = useRef<HTMLDivElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lonRef = useRef<HTMLSpanElement>(null);
  const metaRef = useRef<HTMLSpanElement>(null);
  const latYieldRef = useRef<HTMLSpanElement>(null);
  const lonYieldRef = useRef<HTMLSpanElement>(null);
  const metaYieldRef = useRef<HTMLSpanElement>(null);
  const instrumentsRef = useRef<HTMLSpanElement>(null);
  const scrimRef = useRef<HTMLSpanElement>(null);
  // draw() reads the scrim's offset from here: it only moves when the scrim
  // does (into the map's ground), and draw runs from a rAF loop.
  const scrimOffsetRef = useRef(0);
  scrimOffsetRef.current = scrimHost ? bleed : 0;
  // The readouts are written by the rAF loop in the page's language (read
  // from here); a toggle reprints them in place (below), never replays.
  const lang = useLang();
  const langRef = useRef<Lang>(lang);
  langRef.current = lang;

  const state = useRef({
    focalX: 0,
    focalY: 0,
    shown: initial,
    from: initial,
    to: initial,
    huntStart: 0,
    lockAt: 0,
    hunting: false,
    frame: 0,
    metaFor: '',
    legKm: null as HTMLSpanElement | null,
    /** The leg on the readout now (reprinted in place on a toggle). */
    leg: null as { from: ViewfinderPlace; to: ViewfinderPlace } | null,
    /** Ends the landing's report (see REPORT_HOLD_MS). */
    reportTimer: 0,
    /** The shields the readouts keep off (see `avoid`), and how each moved
     *  (px/ms, as of `t`). */
    boxes: [] as readonly ShieldBox[],
    motion: new Map<string, { x: number; y: number; t: number; vx: number; vy: number }>(),
    /** The leg's line: below the place, or above its shield. */
    legSlot: 'below' as 'below' | 'above',
    /** When the leg began to step back to change lines (0: it is not). */
    legLeaving: 0,
    legTimer: 0,
    /** The leg is up this flight (its first frame picks its line at once). */
    legShown: false,
    /** The atlas has said where its focal point is (`focal`). */
    focalSet: false,
    /** The atlas's width (px), kept on resize: a readout the window's edge
     *  would cut steps back as one a shield covers does. */
    width: 0,
    /** Where the readouts' clear ground ends on the right (px): the rail's
     *  left edge on the desktop (the place in hand's title and lede print
     *  there — a longitude ran under "ZION" at 1280), the atlas's edge on
     *  a phone. DERIVED from the viewport (coverDock's railBox). */
    clearRight: 0,
  });

  // A readout steps back while a shield stands under it (`data-yield` on its
  // wrapper: CSS fades it out, and back in once the shield has gone), written
  // only when it changes. The readouts are placed on fixed offsets from the
  // focal point; the shields stand on their places, so at some landings a
  // neighbour's shield sits exactly where a readout prints (Miami under
  // "MIAMI → ORLANDO 330 KM", Page under Zion's longitude).
  const setYield = (node: HTMLElement | null, on: boolean) => {
    if (!node) return;
    if (on && !node.hasAttribute('data-yield')) node.setAttribute('data-yield', '');
    if (!on && node.hasAttribute('data-yield')) node.removeAttribute('data-yield');
  };
  const blocked = (left: number, top: number, right: number, bottom: number) => {
    const s = state.current;
    const now = performance.now();
    return s.boxes.some((box) => {
      // A moving shield sweeps where it is going (a resting one does not:
      // its last move is old).
      const motion = s.motion.get(box.id);
      let dx = 0;
      let dy = 0;
      if (motion && now - motion.t < 100) {
        dx = Math.max(-YIELD_SWEEP_PX, Math.min(YIELD_SWEEP_PX, motion.vx * YIELD_LEAD_MS));
        dy = Math.max(-YIELD_SWEEP_PX, Math.min(YIELD_SWEEP_PX, motion.vy * YIELD_LEAD_MS));
      }
      return left - YIELD_PAD < Math.max(box.right, box.right + dx) && Math.min(box.left, box.left + dx) < right + YIELD_PAD &&
        top - YIELD_PAD < Math.max(box.bottom, box.bottom + dy) && Math.min(box.top, box.top + dy) < bottom + YIELD_PAD;
    });
  };
  const metaTop = (slot: 'below' | 'above') => state.current.focalY + (slot === 'below' ? META_TOP : -META_ABOVE);
  // Every readout against the shields: DERIVED boxes on both sides (the
  // readouts' from their text and the focal point, the shields' from the
  // camera's projection), no layout read. The leg first tries its other
  // line; it moves there only once it has stepped back, and steps back where
  // both lines are taken.
  const clearReadouts = () => {
    const s = state.current;
    const cx = s.focalX;
    const cy = s.focalY;
    const latChars = readoutChars(latRef.current?.textContent);
    const lonChars = readoutChars(lonRef.current?.textContent);
    const top = cy + 10;
    // The reader can take the place in hand to the window's edge (the map is
    // theirs): a readout the edge would cut is not printed half.
    const cut = (left: number, right: number) => s.width > 0 && (left < EDGE_PX || right > (s.clearRight || s.width) - EDGE_PX);
    const latRight = cx - ARM + READOUT_CHAR_PX * latChars;
    const lonLeft = cx + ARM - READOUT_CHAR_PX * lonChars;
    setYield(latYieldRef.current, latChars > 0 && (cut(cx - ARM, latRight) || blocked(cx - ARM, top, latRight, top + READOUT_LINE_PX)));
    setYield(lonYieldRef.current, lonChars > 0 && (cut(lonLeft, cx + ARM) || blocked(lonLeft, top, cx + ARM, top + READOUT_LINE_PX)));
    const metaChars = readoutChars(metaRef.current?.textContent);
    if (!metaChars) {
      setYield(metaYieldRef.current, false);
      return;
    }
    const half = (READOUT_CHAR_PX * metaChars + META_DOT_PX) / 2;
    const taken = (slot: 'below' | 'above') => cut(cx - half, cx + half) || blocked(cx - half, metaTop(slot), cx + half, metaTop(slot) + READOUT_LINE_PX);
    const other = s.legSlot === 'below' ? 'above' : 'below';
    const here = taken(s.legSlot);
    const moveTo = (slot: 'below' | 'above') => {
      s.legSlot = slot;
      s.legLeaving = 0;
      window.clearTimeout(s.legTimer);
      s.legTimer = 0;
      if (metaRef.current) metaRef.current.style.transform = `translate(${cx}px, ${metaTop(slot)}px) translateX(-50%)`;
    };
    if (!s.legShown) {
      // Not up yet: it takes the free line straight away.
      if (here && !taken(other)) moveTo(other);
      setYield(metaYieldRef.current, taken(s.legSlot));
      return;
    }
    if (!here) {
      s.legLeaving = 0;
      window.clearTimeout(s.legTimer);
      s.legTimer = 0;
      setYield(metaYieldRef.current, false);
      return;
    }
    setYield(metaYieldRef.current, true);
    if (taken(other)) {
      s.legLeaving = 0;
      return;
    }
    const now = performance.now();
    if (!s.legLeaving) s.legLeaving = now;
    if (now - s.legLeaving >= YIELD_OUT_MS) {
      moveTo(other);
      setYield(metaYieldRef.current, false);
    } else if (!s.legTimer) {
      // Nothing may draw again before it has gone (a landed, resting map):
      // come back for it then.
      s.legTimer = window.setTimeout(() => {
        state.current.legTimer = 0;
        clearReadouts();
      }, YIELD_OUT_MS - (now - s.legLeaving) + 16);
    }
  };

  // The report: an attribute on the instruments layer, written only when it
  // changes; CSS does the fading.
  const report = (on: boolean, holdMs = 0) => {
    const s = state.current;
    window.clearTimeout(s.reportTimer);
    s.reportTimer = 0;
    const node = instrumentsRef.current;
    if (!node) return;
    if (on && !node.hasAttribute('data-report')) node.setAttribute('data-report', '');
    if (!on && node.hasAttribute('data-report')) node.removeAttribute('data-report');
    // The readouts' ground goes with them: at rest the place's ground is
    // not dimmed for type that is not printed.
    const scrim = scrimRef.current;
    if (scrim && on !== scrim.hasAttribute('data-report')) {
      if (on) scrim.setAttribute('data-report', '');
      else scrim.removeAttribute('data-report');
    }
    if (on && holdMs > 0) s.reportTimer = window.setTimeout(() => report(false), holdMs);
  };

  // The leg: where from, where to, and the distance covered so far. It stays
  // up through the landing's report with the whole distance, so the trip is
  // read back as it ends, then goes with the layer.
  const setLegMeta = (from: ViewfinderPlace, to: ViewfinderPlace) => {
    const s = state.current;
    const node = metaRef.current;
    const lang = langRef.current;
    const key = `leg:${from.id}>${to.id}:${lang}`;
    if (!node || s.metaFor === key) return;
    s.leg = { from, to };
    node.textContent = '';
    const dot = document.createElement('i');
    dot.className = 'viewfinder__dot';
    node.appendChild(dot);
    // Non-breaking spaces: ordinary ones collapse at the span boundaries.
    // The place being left is the atlas's one lime, and only in the air.
    const parts: Array<[string, string]> = [
      ['is-lime', placeName(from, lang)],
      ['is-dim', '  →  '],
      ['', placeName(to, lang)],
      ['', '   '],
    ];
    parts.forEach(([className, text]) => {
      const span = document.createElement('span');
      if (className) span.className = className;
      span.textContent = text;
      node.appendChild(span);
    });
    const km = document.createElement('span');
    km.className = 'is-dim';
    km.textContent = kmLabel('0', lang);
    node.appendChild(km);
    s.legKm = km;
    s.metaFor = key;
  };

  // One frame of the viewfinder. `u` is ms since take-off; null = at rest.
  const draw = (u: number | null) => {
    const s = state.current;
    const cx = s.focalX;
    const cy = s.focalY;
    const lock = Math.max(MIN_HUNT_MS, s.lockAt - s.huntStart);
    const moving = u !== null;
    const t = u ?? lock + SETTLE_MS;
    const from = s.from;
    const to = s.to;
    const switching = moving && from?.id !== to?.id;
    const huntingNow = moving && t > 120 && t < lock;
    // The readouts hang off the focal point on FIXED offsets: nothing is
    // drawn round the place (the camera puts it exactly here).
    const leftEnd = cx - ARM;
    const rightEnd = cx + ARM;

    // Coordinates count across the flight.
    const travel = moving && from && to ? travelEase(progress(0, lock, t)) : 1;
    if (latRef.current && lonRef.current && to) {
      const latitude = from ? lerp(from.coordinates[1], to.coordinates[1], travel) : to.coordinates[1];
      const longitude = from ? lerp(from.coordinates[0], to.coordinates[0], travel) : to.coordinates[0];
      setText(latRef.current, latitudeLabel(latitude, langRef.current));
      setText(lonRef.current, longitudeLabel(longitude, langRef.current));
      latRef.current.style.transform = `translate(${leftEnd}px, ${cy + 10}px)`;
      lonRef.current.style.transform = `translate(${rightEnd}px, ${cy + 10}px) translateX(-100%)`;
      const coordinateOpacity = huntingNow ? 0.68 : 1;
      latRef.current.style.opacity = String(coordinateOpacity);
      lonRef.current.style.opacity = String(coordinateOpacity);
    }

    // The leg: up from 300ms into a flight, counting its kilometres to the
    // lock; after that it holds the whole distance until the report ends.
    if (metaRef.current) metaRef.current.style.transform = `translate(${cx}px, ${metaTop(s.legSlot)}px) translateX(-50%)`;
    if (switching && from && to && t >= 300) {
      setLegMeta(from, to);
      const covered = t < lock ? travel : 1;
      setText(s.legKm, kmLabel(formatKm(haversineKm(from.coordinates, to.coordinates) * covered), langRef.current));
      if (metaRef.current) metaRef.current.style.opacity = progress(300, 520, t).toFixed(3);
    } else if (switching && metaRef.current) {
      // The first 300ms of a flight: the last trip's line is not this one's.
      // Unseen, it goes back to its own line below the place.
      metaRef.current.style.opacity = '0';
      if (s.legShown) {
        s.legShown = false;
        s.legSlot = 'below';
        s.legLeaving = 0;
        metaRef.current.style.transform = `translate(${cx}px, ${metaTop('below')}px) translateX(-50%)`;
      }
    } else if (metaRef.current) {
      metaRef.current.style.opacity = '1';
    }
    clearReadouts();
    if (switching && t >= 300) s.legShown = true;
    else if (!moving) s.legShown = true;

    const offset = scrimOffsetRef.current;
    if (scrimRef.current) scrimRef.current.style.transform = `translate(${cx + offset}px, ${cy + 16 + offset}px) translate(-50%, -50%)`;
  };

  const stop = () => {
    const s = state.current;
    if (s.frame) cancelAnimationFrame(s.frame);
    s.frame = 0;
  };

  const loop = () => {
    const s = state.current;
    s.frame = 0;
    const u = performance.now() - s.huntStart;
    const lock = Math.max(MIN_HUNT_MS, s.lockAt - s.huntStart);
    if (u >= lock + SETTLE_MS) {
      s.hunting = false;
      s.from = s.to;
      s.shown = s.to;
      draw(null);
      // Landed: hold the report, then step back.
      report(true, REPORT_HOLD_MS);
      return;
    }
    draw(u);
    s.frame = requestAnimationFrame(loop);
  };

  // 中 / EN toggled: the readouts at rest are reprinted where they stand (a
  // flight in the air picks the language up on its next frame).
  const langShown = useRef(lang);
  useEffect(() => {
    if (langShown.current === lang) return;
    langShown.current = lang;
    const s = state.current;
    if (s.hunting) return;
    if (s.shown) {
      setText(latRef.current, latitudeLabel(s.shown.coordinates[1], lang));
      setText(lonRef.current, longitudeLabel(s.shown.coordinates[0], lang));
    }
    if (s.leg) {
      const { from, to } = s.leg;
      setLegMeta(from, to);
      if (s.legKm) s.legKm.textContent = kmLabel(formatKm(haversineKm(from.coordinates, to.coordinates)), lang);
    }
    clearReadouts();
  }, [lang]);

  useImperativeHandle(forwardedRef, () => {
    const settle = (place: ViewfinderPlace) => {
      const s = state.current;
      // Arriving somewhere without a flight (reduced motion's scrubbed
      // camera, a restart that snaps) reports like a landing, with the leg it
      // made; settling on the place already shown (first draw, a Story
      // closing) stays quiet.
      const arrived = !!s.shown && s.shown.id !== place.id;
      if (arrived && s.shown) {
        setLegMeta(s.shown, place);
        if (s.legKm) s.legKm.textContent = kmLabel(formatKm(haversineKm(s.shown.coordinates, place.coordinates)), langRef.current);
      }
      report(arrived, SETTLE_MS + REPORT_HOLD_MS);
      stop();
      s.hunting = false;
      s.from = place;
      s.to = place;
      s.shown = place;
      draw(null);
    };
    return {
      settle,
      avoid(boxes: readonly ShieldBox[]) {
        const s = state.current;
        const now = performance.now();
        boxes.forEach((box) => {
          const x = (box.left + box.right) / 2;
          const y = box.bottom;
          const last = s.motion.get(box.id);
          // Twice a frame (the map's move and render): only a new frame
          // measures a speed; a long gap is a shield at rest.
          if (last && now - last.t < 8) return;
          const dt = last ? now - last.t : Infinity;
          s.motion.set(box.id, {
            x,
            y,
            t: now,
            vx: last && dt < 100 ? (x - last.x) / dt : 0,
            vy: last && dt < 100 ? (y - last.y) / dt : 0,
          });
        });
        s.boxes = boxes;
        clearReadouts();
      },
      hunt(to: ViewfinderPlace, lockAt: number) {
        const s = state.current;
        if (reducedMotion) {
          settle(to);
          return;
        }
        if (!s.hunting) {
          s.from = s.shown ?? to;
          s.huntStart = performance.now();
          s.hunting = true;
        }
        // The trip is on the instruments from take-off to the landing's hold.
        report(true);
        s.to = to;
        s.lockAt = Math.max(lockAt, s.huntStart + MIN_HUNT_MS);
        if (!s.frame) s.frame = requestAnimationFrame(loop);
      },
      focal(point: { x: number; y: number }) {
        const s = state.current;
        s.focalSet = true;
        if (Math.abs(point.x - s.focalX) < 0.25 && Math.abs(point.y - s.focalY) < 0.25) return;
        s.focalX = point.x;
        s.focalY = point.y;
        if (!s.hunting) draw(null);
      },
    };
    // draw/stop/loop only touch refs, so reducedMotion is the only input.
  }, [reducedMotion]);

  // The focal point mirrors RouteAtlas's chapter padding: 264px off the atlas
  // column's right edge, and on the archive's reading line, where the
  // chapter's photograph is.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const s = state.current;
      s.width = root.clientWidth;
      s.clearRight = window.innerWidth >= 1024 ? Math.min(root.clientWidth, railBox(window.innerWidth).left) : root.clientWidth;
      // Once the atlas has said where its focal point is, it keeps it there.
      if (s.focalSet) return;
      s.focalX = (root.clientWidth - 264) / 2;
      // DERIVED, not measured — the same correction the camera needed. This
      // read a live rect whose top is scroll-dependent (the stage sits at 0
      // only while it is pinned) and then kept the answer until the next
      // resize. Resizing the window while the stage was released wrote a focal
      // point a thousand pixels down and split the cross from the marks for the
      // rest of the session. The camera now assumes the stage is pinned; the
      // cross has to assume the same thing, or the two quietly disagree.
      s.focalY = ATLAS_READING_LINE * window.innerHeight;
      if (!s.hunting) draw(null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // The scrim moved into the map's ground: place the new node.
  useLayoutEffect(() => {
    if (!state.current.hunting) draw(null);
    // draw only touches refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrimHost, bleed]);

  useEffect(() => () => {
    stop();
    window.clearTimeout(state.current.reportTimer);
    window.clearTimeout(state.current.legTimer);
  }, []);

  return (
    <motion.div ref={rootRef} aria-hidden="true" className="viewfinder" style={{ opacity: visibility }}>
      {/* No reticle, no cross, no level and no name: a crosshair aims at
          something, and this map is not aiming — it is showing where a
          photograph was made. The place is signed by its route shield (on
          the map and on its ticket); what stays here is the reading of a
          trip — coordinates and the leg — the documentary register this page
          is written in. */}
      {/* The scrim darkens the ground round the focal point so the readouts
          hold on pale rock. Once the map is up it lies on the map's own
          ground, under the places' ink, fading with the sign. */}
      {scrimHost
        ? createPortal(
          <motion.span className="viewfinder__scrim-layer" style={{ opacity: visibility }}>
            <span ref={scrimRef} className="viewfinder__scrim" />
          </motion.span>,
          scrimHost,
        )
        : <span ref={scrimRef} className="viewfinder__scrim" />}
      {/* The readouts: instrument type, reported on demand (see above). */}
      {/* Each readout on its own layer, which steps back (`data-yield`)
          while a shield stands under it: the readouts' own opacity is
          written per frame. */}
      <span ref={instrumentsRef} className="viewfinder__instruments">
        <span ref={latYieldRef} className="viewfinder__yield"><span ref={latRef} className="viewfinder__readout" /></span>
        <span ref={lonYieldRef} className="viewfinder__yield"><span ref={lonRef} className="viewfinder__readout" /></span>
        <span ref={metaYieldRef} className="viewfinder__yield"><span ref={metaRef} className="viewfinder__readout viewfinder__meta" /></span>
      </span>
    </motion.div>
  );
});

/**
 * AtlasTicks — the archive as a strip of ticks under the map, one tick per
 * frame, grouped by chapter (after Ian Coad DP's tick timeline). The current
 * chapter's group is a little taller in full bone ink; pointing at a group
 * brightens it and shows its number, name and frame count; a click is a
 * voyage there.
 * `is-current` is toggled on the group buttons by the atlas (no re-render
 * mid-flight), so the class here is only the initial one.
 */
export function AtlasTicks({ chapters, currentId, engagedId, onEngage, onNavigate }: {
  chapters: Array<{ id: string; number: number; name: string; nameZh?: string; frames: number }>;
  currentId: string | null;
  engagedId: string | null;
  onEngage?: (chapterId: string | null) => void;
  onNavigate?: (chapterId: string, options?: AtlasNavigateOptions) => void;
}) {
  const [initialCurrent] = useState(currentId);
  const lang = useLang();
  return (
    <ol className="atlas-ticks" aria-label={tr(lang, 'sign.ticksAria')}>
      {chapters.map((chapter) => (
        <li key={chapter.id} className="atlas-ticks__item">
          <button
            type="button"
            data-tick-group={chapter.id}
            data-engaged={engagedId === chapter.id ? '' : undefined}
            className={`atlas-ticks__group${chapter.id === initialCurrent ? ' is-current' : ''}`}
            aria-label={tr(lang, 'sign.tickAria', { n: chapter.number, name: (lang === 'zh' && chapter.nameZh) || chapter.name, frames: chapter.frames })}
            onPointerEnter={() => onEngage?.(chapter.id)}
            onPointerLeave={() => onEngage?.(null)}
            onFocus={() => onEngage?.(chapter.id)}
            onBlur={() => onEngage?.(null)}
            onClick={(event) => onNavigate?.(chapter.id, { focus: event.detail === 0 })}
          >
            <span className="atlas-ticks__label" aria-hidden="true">
              {pad2(chapter.number)}&nbsp;·&nbsp;<Bi en={chapter.name} zh={chapter.nameZh} />
              <span className="atlas-ticks__frames">&nbsp;·&nbsp;<T k="chapter.rail.frames" vars={{ frames: chapter.frames }} /></span>
            </span>
            {Array.from({ length: Math.max(1, chapter.frames) }, (_, index) => <i key={index} />)}
          </button>
        </li>
      ))}
    </ol>
  );
}


/** A stop chosen on the atlas: `focus` false keeps keyboard focus where it
 *  is (a pointer's click), true or absent takes it to the chapter. */
export interface AtlasNavigateOptions {
  focus?: boolean;
}

export interface ShieldStop {
  id: string;
  /** 1-based stop number. */
  number: number;
  /** English: the shield prints it (the signs stay English). */
  name: string;
  /** Its Chinese twin: what a screen reader hears in 中. */
  nameZh?: string;
  region?: string;
  /** The chapter's slug: its ticket stock, printed in the shield's band. */
  slug?: string;
}

/**
 * PlaceShield — one place's shield on the map (owner, 2026-09-28: 完全和这个
 * 网站对齐 11moissanstoit.com/etape/paris-1). Every place stands on its own:
 * the shield is a Mapbox marker anchored at its bottom on the place, and its
 * foot's point IS the place — no post, stem or leader (不需要白色竖干). Its
 * form is its state's (src/lib/routeShield.ts, SHIELD_FORMS), its band the
 * place's ticket stock, so no two regions share a style (每个地区的路牌盾风格
 * 不能一样) and each shield is the one its ticket prints.
 *
 * Where shields meet at a camera's zoom they stack like a pile of stop signs
 * (`stackShields`): the atlas writes a buried shield's lift (`--lift`), its
 * place in the pile (the marker's z-index) and, on a pile's front shield, the
 * pile's count (`data-pile`) — derived per camera frame from the camera's
 * projection (RouteAtlas, "The shields"), never read off the page.
 *
 * Each shield is a button (the in-map navigation): it carries its state by
 * size and ink — ahead quieter, visited fuller, the one the camera is flying
 * to comes up at take-off, the one it is on stands tallest and gives a small
 * landing accent. The atlas toggles is-current / is-inbound / is-past on the
 * button directly (no re-render mid-flight). Pointed at, a shield comes to the
 * top of its pile, brings its chapter's cover up and prints the place's name
 * over itself.
 */
export function PlaceShield({ stop, width, initialCurrentId, engaged, visibility, onEngage, onNavigate }: {
  stop: ShieldStop;
  /** The shield's box width at its resting size, css px (SHIELD_MAP_PX). */
  width: number;
  /** Only the first render reads this. */
  initialCurrentId: string | null;
  engaged: boolean;
  visibility: MotionValue<number>;
  /** Pointer or focus on the shield (null when it leaves). */
  onEngage?: (chapterId: string | null) => void;
  /** A click: go to that chapter (keyboard focus goes with a keyboard's
   *  click only, `event.detail` 0: a mouse's left a lime ring round the
   *  whole destination chapter, a second lime in the view). */
  onNavigate?: (chapterId: string, options?: AtlasNavigateOptions) => void;
}) {
  const [initialCurrent] = useState(initialCurrentId);
  const lang = useLang();
  // Invisible shields (the prologue, the entrance) must not be hit targets,
  // nor stops in the tab order: `visibility` removes both, off the same
  // value, with no re-render.
  const pointerEvents = useTransform(visibility, (value) => (value > 0.5 ? 'auto' : 'none'));
  const reachable = useTransform(visibility, (value) => (value > 0.5 ? 'visible' : 'hidden'));
  return (
    <motion.span
      className="place-shield"
      data-place-shield={stop.id}
      style={{ opacity: visibility, pointerEvents, visibility: reachable }}
    >
      <button
        type="button"
        data-af-stop={stop.id}
        data-chapter={stop.number}
        data-engaged={engaged ? '' : undefined}
        className={`place-shield__sign${stop.id === initialCurrent ? ' is-current' : ''}`}
        aria-label={tr(lang, 'sign.shieldAria', { n: stop.number, name: (lang === 'zh' && stop.nameZh) || stop.name })}
        onPointerEnter={() => onEngage?.(stop.id)}
        onPointerLeave={() => onEngage?.(null)}
        onFocus={() => onEngage?.(stop.id)}
        onBlur={() => onEngage?.(null)}
        onClick={(event) => onNavigate?.(stop.id, { focus: event.detail === 0 })}
      >
        <MapShield code={stateCode(stop.region)} number={pad2(stop.number)} accent={stockPaper(stop.slug)} width={width} />
        <span className="place-shield__name font-ui" aria-hidden="true">{stop.name}</span>
      </button>
    </motion.span>
  );
}
