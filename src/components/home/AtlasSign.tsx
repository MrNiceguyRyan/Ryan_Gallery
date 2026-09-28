import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cubicBezier, motion, useTransform, type MotionValue } from 'framer-motion';
import { EASE } from '../../lib/motion';
// The leg's distance: the one rule /about's route figure also reads.
import { formatKm, haversineKm } from '../../lib/geo';
import { pad2, stateCode } from '../../lib/routeShield';
import { MapShield } from './RouteShield';

/** Everything the sign prints for a place. */
export interface ViewfinderPlace {
  id: string;
  name: string;
  /** 1-based chapter number. */
  number: number;
  total: number;
  year?: number | string;
  frames: number;
  region?: string;
  /** [longitude, latitude] */
  coordinates: [number, number];
}

export interface ViewfinderHandle {
  /** Show a place at rest, with no animation (first draw, restores, reduced motion). */
  settle(place: ViewfinderPlace): void;
  /**
   * The camera has taken off toward `to`: the sign reads the flight until
   * `lockAt` (a performance.now() timestamp — the flight's touchdown), then
   * locks. Calling it again mid-flight retargets: same flight, new subject and
   * lock time.
   */
  hunt(to: ViewfinderPlace, lockAt: number): void;
}

// Geometry, measured from the atlas focal point (the place the camera rests on).
const ARM = 168;
const META_TOP = 84;
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

const latitudeLabel = (latitude: number) => `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}`;
const longitudeLabel = (longitude: number) => `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`;

/**
 * AtlasSign — what the map says about a trip, set around the focal point in
 * the plainest instrument type it can: the latitude and longitude out at the
 * ends of the reading line, and, for a flight, one line below it carrying the
 * leg — where from, where to, and the kilometres covered.
 *
 * It does not name the place. The place is signed twice already, and both
 * signs are the same route shield: on the map, where its region's sign stands
 * (RouteSign), and on the chapter's ticket, whose stub IS the place's sign —
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
  const instrumentsRef = useRef<HTMLSpanElement>(null);
  const scrimRef = useRef<HTMLSpanElement>(null);
  // draw() reads the scrim's offset from here: it only moves when the scrim
  // does (into the map's ground), and draw runs from a rAF loop.
  const scrimOffsetRef = useRef(0);
  scrimOffsetRef.current = scrimHost ? bleed : 0;

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
    /** Ends the landing's report (see REPORT_HOLD_MS). */
    reportTimer: 0,
  });

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
    if (on && holdMs > 0) s.reportTimer = window.setTimeout(() => report(false), holdMs);
  };

  // The leg: where from, where to, and the distance covered so far. It stays
  // up through the landing's report with the whole distance, so the trip is
  // read back as it ends, then goes with the layer.
  const setLegMeta = (from: ViewfinderPlace, to: ViewfinderPlace) => {
    const s = state.current;
    const node = metaRef.current;
    const key = `leg:${from.id}>${to.id}`;
    if (!node || s.metaFor === key) return;
    node.textContent = '';
    const dot = document.createElement('i');
    dot.className = 'viewfinder__dot';
    node.appendChild(dot);
    // Non-breaking spaces: ordinary ones collapse at the span boundaries.
    // The place being left is the atlas's one lime, and only in the air.
    const parts: Array<[string, string]> = [
      ['is-lime', from.name],
      ['is-dim', '  →  '],
      ['', to.name],
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
    km.textContent = '0 KM';
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
      latRef.current.textContent = latitudeLabel(latitude);
      lonRef.current.textContent = longitudeLabel(longitude);
      latRef.current.style.transform = `translate(${leftEnd}px, ${cy + 10}px)`;
      lonRef.current.style.transform = `translate(${rightEnd}px, ${cy + 10}px) translateX(-100%)`;
      const coordinateOpacity = huntingNow ? 0.68 : 1;
      latRef.current.style.opacity = String(coordinateOpacity);
      lonRef.current.style.opacity = String(coordinateOpacity);
    }

    // The leg: up from 300ms into a flight, counting its kilometres to the
    // lock; after that it holds the whole distance until the report ends.
    if (metaRef.current) metaRef.current.style.transform = `translate(${cx}px, ${cy + META_TOP}px) translateX(-50%)`;
    if (switching && from && to && t >= 300) {
      setLegMeta(from, to);
      const covered = t < lock ? travel : 1;
      if (s.legKm) s.legKm.textContent = `${formatKm(haversineKm(from.coordinates, to.coordinates) * covered)} KM`;
      if (metaRef.current) metaRef.current.style.opacity = progress(300, 520, t).toFixed(3);
    } else if (switching && metaRef.current) {
      // The first 300ms of a flight: the last trip's line is not this one's.
      metaRef.current.style.opacity = '0';
    } else if (metaRef.current) {
      metaRef.current.style.opacity = '1';
    }

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
        if (s.legKm) s.legKm.textContent = `${formatKm(haversineKm(s.shown.coordinates, place.coordinates))} KM`;
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
      <span ref={instrumentsRef} className="viewfinder__instruments">
        <span ref={latRef} className="viewfinder__readout" />
        <span ref={lonRef} className="viewfinder__readout" />
        <span ref={metaRef} className="viewfinder__readout viewfinder__meta" />
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
  chapters: Array<{ id: string; number: number; name: string; frames: number }>;
  currentId: string | null;
  engagedId: string | null;
  onEngage?: (chapterId: string | null) => void;
  onNavigate?: (chapterId: string) => void;
}) {
  const [initialCurrent] = useState(currentId);
  return (
    <ol className="atlas-ticks" aria-label="Chapters">
      {chapters.map((chapter) => (
        <li key={chapter.id} className="atlas-ticks__item">
          <button
            type="button"
            data-tick-group={chapter.id}
            data-engaged={engagedId === chapter.id ? '' : undefined}
            className={`atlas-ticks__group${chapter.id === initialCurrent ? ' is-current' : ''}`}
            aria-label={`Go to chapter ${chapter.number}: ${chapter.name}, ${chapter.frames} frames`}
            onPointerEnter={() => onEngage?.(chapter.id)}
            onPointerLeave={() => onEngage?.(null)}
            onFocus={() => onEngage?.(chapter.id)}
            onBlur={() => onEngage?.(null)}
            onClick={() => onNavigate?.(chapter.id)}
          >
            <span className="atlas-ticks__label" aria-hidden="true">
              {pad2(chapter.number)}&nbsp;·&nbsp;{chapter.name}
              <span className="atlas-ticks__frames">&nbsp;·&nbsp;{chapter.frames} frames</span>
            </span>
            {Array.from({ length: Math.max(1, chapter.frames) }, (_, index) => <i key={index} />)}
          </button>
        </li>
      ))}
    </ol>
  );
}


/** A map shield's size and the gap between two in one sign, css px. */
export const SIGN_SHIELD_PX = 30;
export const SIGN_SHIELD_GAP = 8;
/** A sign's row: its shields side by side. */
export const signRowWidth = (count: number) => count * SIGN_SHIELD_PX + Math.max(0, count - 1) * SIGN_SHIELD_GAP;
/** How far the leader may sit off the row's middle and still meet the rail
 *  the shields stand on (a single shield has no rail: its own point). */
export const signRailHalf = (count: number) => (Math.max(0, count - 1) * (SIGN_SHIELD_PX + SIGN_SHIELD_GAP)) / 2;

export interface SignStop {
  id: string;
  /** 1-based stop number. */
  number: number;
  name: string;
  region?: string;
}

/**
 * RouteSign — one region's sign on the map (owner, 2026-09-28: 甲，我喜欢路盾
 * 这样). The places of a stretch of the route stand as US-route shields side
 * by side, in stop order (按照数字排序即可), on one rail, and ONE leader runs
 * from the rail down to the middle of the region they share (引线指向一段区域
 * 即可，同一块区域不需要反复指引). No post under a shield (不需要下面的引线), no
 * ring, halo, dot or crosshair, and no lime: bone plate, dark ink, the map's
 * white ink for the leader.
 *
 * The sign is a Mapbox marker anchored at its bottom on the middle of the
 * region's stretch of road. How long the leader is and how far the row
 * slides sideways are written per camera frame by the atlas (`--lead`,
 * `--shift`: RouteAtlas, "The signs"), derived from the camera's projection —
 * never read off the page. A place alone in its region (New York) has no
 * leader and no rail: its shield stands just over the place (SIGN_SINGLE_GAP)
 * and its own point is the pointer, as on 11 mois's stop signs.
 *
 * Each shield is a button (the in-map navigation): it carries its state by
 * size and ink — ahead quieter, visited fuller, the one the camera is flying
 * to comes up at take-off, the one it is on stands tallest and gives a small
 * landing accent. The atlas toggles is-current / is-inbound / is-past on the
 * shields directly (no re-render mid-flight). Pointed at, a shield brings its
 * chapter's cover up and prints the place's name over itself.
 */
export function RouteSign({ signKey, stops, initialCurrentId, engagedId, visibility, onEngage, onNavigate }: {
  signKey: string;
  stops: SignStop[];
  /** Only the first render reads this. */
  initialCurrentId: string | null;
  engagedId: string | null;
  visibility: MotionValue<number>;
  /** Pointer or focus on a shield (null when it leaves). */
  onEngage?: (chapterId: string | null) => void;
  /** A click: go to that chapter. */
  onNavigate?: (chapterId: string) => void;
}) {
  const [initialCurrent] = useState(initialCurrentId);
  // Invisible signs (the prologue, the entrance) must not be hit targets, nor
  // stops in the tab order: `visibility` removes both, off the same value,
  // with no re-render.
  const pointerEvents = useTransform(visibility, (value) => (value > 0.5 ? 'auto' : 'none'));
  const reachable = useTransform(visibility, (value) => (value > 0.5 ? 'visible' : 'hidden'));
  const count = stops.length;
  return (
    <motion.span
      className={`route-sign${count === 1 ? ' route-sign--single' : ''}`}
      data-route-sign={signKey}
      style={{
        opacity: visibility,
        pointerEvents,
        visibility: reachable,
        width: signRowWidth(count),
        ['--rail' as never]: `${signRailHalf(count) * 2}px`,
      }}
    >
      {count > 1 && <i className="route-sign__lead" aria-hidden="true" />}
      <span className="route-sign__row">
        {count > 1 && <i className="route-sign__rail" aria-hidden="true" />}
        {stops.map((stop) => (
          <button
            key={stop.id}
            type="button"
            data-af-stop={stop.id}
            data-chapter={stop.number}
            data-engaged={engagedId === stop.id ? '' : undefined}
            className={`route-sign__shield${stop.id === initialCurrent ? ' is-current' : ''}`}
            aria-label={`Go to chapter ${stop.number}: ${stop.name}`}
            onPointerEnter={() => onEngage?.(stop.id)}
            onPointerLeave={() => onEngage?.(null)}
            onFocus={() => onEngage?.(stop.id)}
            onBlur={() => onEngage?.(null)}
            onClick={() => onNavigate?.(stop.id)}
          >
            <MapShield code={stateCode(stop.region)} number={pad2(stop.number)} />
            <span className="route-sign__name font-ui" aria-hidden="true">{stop.name}</span>
          </button>
        ))}
      </span>
    </motion.span>
  );
}
