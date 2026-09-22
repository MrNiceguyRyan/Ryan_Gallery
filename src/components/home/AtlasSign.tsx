import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';
import { LANDMARK_VIEWBOX, landmarkFor, landmarkLift } from '../../lib/placeLandmarks';

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
const HALF_W = 52;
const HALF_H = 36;
const ARM = 168;
const META_TOP = 84;
/** Where the archive reads: the line a chapter's cover photograph sits on
 *  (HomePage scrolls a chapter to it), and therefore the line the map's focal
 *  point and this sign must share — otherwise the sign reads out a place
 *  40-odd pixels below the photograph it belongs to. */
export const ATLAS_READING_LINE = 0.48;

/** The lock settles (readouts typing in, lime cooling) over this long. */
const SETTLE_MS = 510;
const MIN_HUNT_MS = 600;

const BONE: [number, number, number] = [244, 244, 237];
const LIME: [number, number, number] = [210, 255, 0];

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const progress = (a: number, b: number, value: number) => clamp((value - a) / (b - a));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const mixColor = (t: number) =>
  `rgb(${BONE.map((channel, index) => Math.round(lerp(channel, LIME[index], t))).join(',')})`;

const pad2 = (value: number) => String(value).padStart(2, '0');

const EARTH_RADIUS_KM = 6371;
function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
const formatKm = (km: number) => Math.round(km).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
const latitudeLabel = (latitude: number) => `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}`;
const longitudeLabel = (longitude: number) => `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`;

/**
 * AtlasSign — what the map says about the place it is resting on, set around
 * the focal point in the plainest instrument type it can: the year above, the
 * latitude and longitude out at the ends of the reading line, and one line
 * below carrying the chapter, the region and the frame count.
 *
 * It does not mark the place. The place marks itself — every place on this map
 * wears the same benchmark disc (see AfPoint), and the camera lands the current
 * one exactly on this focal point, so the sign has nothing left to aim with.
 *
 * When the atlas flies to the next place the sign reads the flight rather than
 * performing it: the coordinates count across, the readout blanks and gives the
 * leg's distance in kilometres as it goes, and at touchdown everything types
 * back in behind a single lime confirmation. All drawing is imperative inside
 * one rAF loop that runs only while something moves; React renders once.
 */
export const AtlasViewfinder = forwardRef<ViewfinderHandle, {
  initial: ViewfinderPlace | null;
  visibility: MotionValue<number>;
  reducedMotion: boolean;
}>(function AtlasViewfinder({ initial, visibility, reducedMotion }, forwardedRef) {
  const rootRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLSpanElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lonRef = useRef<HTMLSpanElement>(null);
  const metaRef = useRef<HTMLSpanElement>(null);
  const scrimRef = useRef<HTMLSpanElement>(null);

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
    /** The chapter number last shown in the readout, for the roll. */
    ordinalShown: null as number | null,
    legKm: null as HTMLSpanElement | null,
    metaChars: [] as HTMLSpanElement[],
    metaDot: null as HTMLElement | null,
  });

  const setMeta = (place: ViewfinderPlace | null) => {
    const s = state.current;
    const node = metaRef.current;
    if (!node || !place || s.metaFor === place.id) return;
    const parts: Array<[string, string]> = [
      ['is-dim', ` / ${pad2(place.total)}`],
      ['', '   '],
      ['', place.region ?? ''],
      ['', place.region ? '   ' : ''],
      ['', `${place.frames} frames`],
    ];
    node.textContent = '';
    const dot = document.createElement('i');
    dot.className = 'viewfinder__dot';
    node.appendChild(dot);
    const chars: HTMLSpanElement[] = [];
    // The chapter number rolls like a counter: up when the archive moves on,
    // down when it turns back — the letters shuffle, the figures roll.
    const ordinal = document.createElement('span');
    ordinal.className = 'is-lime viewfinder__ordinal';
    const strip = document.createElement('span');
    strip.className = 'viewfinder__ordinal-strip';
    const previous = s.ordinalShown;
    if (previous != null && previous !== place.number) {
      const up = place.number > previous;
      [up ? previous : place.number, up ? place.number : previous].forEach((value) => {
        const line = document.createElement('span');
        line.textContent = pad2(value);
        strip.appendChild(line);
      });
      strip.style.transform = up ? 'translateY(0)' : 'translateY(-1em)';
      requestAnimationFrame(() => {
        strip.style.transition = 'transform 360ms cubic-bezier(0.16, 1, 0.3, 1)';
        strip.style.transform = up ? 'translateY(-1em)' : 'translateY(0)';
      });
    } else {
      strip.textContent = pad2(place.number);
    }
    ordinal.appendChild(strip);
    node.appendChild(ordinal);
    chars.push(ordinal);
    s.ordinalShown = place.number;
    parts.forEach(([className, text]) => {
      for (const character of text) {
        const span = document.createElement('span');
        if (className) span.className = className;
        span.textContent = character === ' ' ? ' ' : character;
        node.appendChild(span);
        chars.push(span);
      }
    });
    s.metaChars = chars;
    s.metaDot = dot;
    s.metaFor = place.id;
  };

  // In flight the readout is the leg: where from, where to, and the distance
  // covered so far.
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
    const parts: Array<[string, string]> = [
      ['is-lime', from.name],
      ['is-dim', '\u00a0\u00a0→\u00a0\u00a0'],
      ['', to.name],
      ['', '\u00a0\u00a0\u00a0'],
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
    s.metaChars = [];
    s.metaDot = dot;
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
    let lime = 0;
    if (moving && t >= lock - 10) {
      lime = t < lock + 6
        ? progress(lock - 10, lock + 6, t)
        : t < lock + 160
          ? 1
          : 1 - easeInOutSine(progress(lock + 160, lock + SETTLE_MS, t));
    }
    const color = mixColor(lime);
    // Nothing is drawn around the place any more — no brackets, no cross, no
    // level. The place draws itself: its benchmark disc is the focal mark, and
    // the camera puts it exactly here.
    //
    // So the readouts hang off the focal point on FIXED offsets, which is a
    // correction, not a tidy-up: they used to be pinned to the reticle's live
    // scale, and with the reticle gone the year was still swinging 37px
    // outward on every flight, tracking a bracket nobody could see.
    const topRightX = cx + HALF_W;
    const topRightY = cy - HALF_H;
    const leftEnd = cx - ARM;
    const rightEnd = cx + ARM;

    // Coordinates count across the flight.
    const travel = moving && from && to ? easeInOutCubic(progress(0, lock, t)) : 1;
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

    // Year rides the top-right bracket; blanks while hunting, blinks back on.
    if (yearRef.current && to) {
      yearRef.current.textContent = to.year != null ? String(to.year) : '';
      yearRef.current.style.transform = `translate(${topRightX.toFixed(1)}px, ${(topRightY - 16).toFixed(1)}px) translateX(-100%)`;
      let yearOpacity = 1;
      if (switching) {
        yearOpacity = t < 200
          ? 1 - progress(40, 120, t)
          : t < lock + 110
            ? 0
            : Math.floor((t - lock - 110) / 55) % 2 === 0 || t > lock + 290 ? 1 : 0;
      }
      yearRef.current.style.opacity = String(yearOpacity);
    }

    // Readout line: blanks right to left on take-off, shows the leg and the
    // distance covered while the camera flies, types back in after the lock.
    if (metaRef.current) metaRef.current.style.transform = `translate(${cx}px, ${cy + META_TOP}px) translateX(-50%)`;
    const inFlight = switching && !!from && !!to && t >= 300 && t < lock;
    if (inFlight) {
      setLegMeta(from, to);
      if (s.legKm) s.legKm.textContent = `${formatKm(haversineKm(from.coordinates, to.coordinates) * travel)} KM`;
      if (metaRef.current) metaRef.current.style.opacity = progress(300, 520, t).toFixed(3);
    } else {
      setMeta(switching && t < 300 ? from : to);
      if (metaRef.current) metaRef.current.style.opacity = '1';
    }
    const count = s.metaChars.length;
    s.metaChars.forEach((span, index) => {
      let on = 1;
      if (switching) on = t < 300 ? (t < 30 + (count - index) * 5 ? 1 : 0) : t >= lock + 30 + index * 10 ? 1 : 0;
      span.style.opacity = String(on);
    });
    if (s.metaDot) {
      if (!switching || t >= lock) {
        s.metaDot.style.opacity = '1';
        s.metaDot.style.transform = switching
          ? `scale(${(1 + 0.8 * (1 - easeOutCubic(progress(lock, lock + 260, t)))).toFixed(3)})`
          : 'none';
      } else {
        s.metaDot.style.opacity = t < 40 ? '1' : '0';
        s.metaDot.style.transform = 'none';
      }
    }

    if (scrimRef.current) scrimRef.current.style.transform = `translate(${cx}px, ${cy + 16}px) translate(-50%, -50%)`;
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
      return;
    }
    draw(u);
    s.frame = requestAnimationFrame(loop);
  };

  useImperativeHandle(forwardedRef, () => {
    const settle = (place: ViewfinderPlace) => {
      const s = state.current;
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

  useEffect(() => () => stop(), []);

  return (
    <motion.div ref={rootRef} aria-hidden="true" className="viewfinder" style={{ opacity: visibility }}>
      {/* The reticle is gone: no cross, no electronic level, no arrival ring,
          and no place name. A crosshair aims at something, and this map is not
          aiming — it is showing where a photograph was made. The place's own
          landmark now marks the point (see AfPoint below), and since the camera
          centres the current place exactly here, that landmark IS the focal
          mark. The name went with it because the chapter's cover already sets
          it three times larger, forty-nine pixels away: the page was saying the
          same word twice in two voices.
          What stays is the reading — year, coordinates, chapter, frame count —
          because that is the documentary register this page is written in, and
          it is the one thing a crosshair was never needed for. */}
      <span ref={scrimRef} className="viewfinder__scrim" />
      <span ref={yearRef} className="viewfinder__readout" />
      <span ref={latRef} className="viewfinder__readout" />
      <span ref={lonRef} className="viewfinder__readout" />
      <span ref={metaRef} className="viewfinder__readout viewfinder__meta" />
    </motion.div>
  );
});

/**
 * AtlasTicks — the archive as a strip of ticks under the map, one tick per
 * frame, grouped by chapter (after Ian Coad DP's tick timeline). The current
 * chapter's group is lime and a little taller; pointing at a group grows it
 * and shows its number, name and frame count; a click is a voyage there.
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

/**
 * Every place on the map carries the same landmark: a surveyor's benchmark
 * disc. It says where it stands by SIZE and INK, not by aiming — far places sit
 * small and quiet, the place being flown to squares up to full size before the
 * camera arrives, the place the camera is on is full size and bright, and a
 * place the camera leaves blinks once on its way back down.
 */
export function AfPoint({ stopId, slug, number, name, initiallyCurrent, engaged, visibility, onEngage, onNavigate }: {
  stopId: string;
  /** The collection slug, which is how a place finds its own landmark. */
  slug?: string;
  number: number;
  name: string;
  /** Its chapter's cover photograph is hovered or focused in the archive. */
  engaged: boolean;
  /** Only the first render reads this; afterwards the atlas toggles
   *  `is-current` on the element directly (no re-render mid-flight). */
  initiallyCurrent: boolean;
  visibility: MotionValue<number>;
  /** Pointer or focus on the point (null when it leaves). */
  onEngage?: (chapterId: string | null) => void;
  /** A click: go to that chapter. */
  onNavigate?: (chapterId: string) => void;
}) {
  const landmark = landmarkFor(slug);
  // `has-landmark` gates every rule that hands the point over to the drawing.
  // Without it the disc hid on arrival at a place that has no drawing yet and
  // the mark vanished off the map entirely — the undrawn city, which is the
  // one case this whole fallback exists to serve.
  const [initialClass] = useState(
    () => `af-point__mark${landmark ? ' has-landmark' : ''}${initiallyCurrent ? ' is-current' : ''}`,
  );
  // Invisible points (the prologue, the entrance) must not be hit targets —
  // and `pointer-events: none` alone leaves the button in the tab order and
  // in the accessibility tree, so a keyboard visitor tabs through six
  // invisible chapter buttons on the way in. `visibility` removes both, off
  // the same value, with no re-render.
  const pointerEvents = useTransform(visibility, (value) => (value > 0.5 ? 'auto' : 'none'));
  const reachable = useTransform(visibility, (value) => (value > 0.5 ? 'visible' : 'hidden'));
  return (
    <motion.span className="af-point" style={{ opacity: visibility, pointerEvents, visibility: reachable }}>
      {/* `data-engaged`, not a class: React owns the attribute, the atlas
          owns the class list. The point is a real button — with the route
          rail gone it is the archive's in-map navigation. */}
      <button
        type="button"
        data-af-stop={stopId}
        data-engaged={engaged ? '' : undefined}
        className={initialClass}
        aria-label={`Go to chapter ${number}: ${name}`}
        onPointerEnter={() => onEngage?.(stopId)}
        onPointerLeave={() => onEngage?.(null)}
        onFocus={() => onEngage?.(stopId)}
        onBlur={() => onEngage?.(null)}
        onClick={() => onNavigate?.(stopId)}
      >
        {/* Pointing at a chapter's cover photograph rings its place. With a
            landmark inside it, that ring stops being a ring around a dot and
            becomes the place's medal — which is the whole brief, arrived at on
            the map without a drop of colour. It has to be wide enough to clear
            the drawing, or the peak poked out through the rim. */}
        <span className={`af-point__ring${landmark ? ' af-point__ring--medal' : ''}`} />
        {/* The place, drawn as its landmark.
            A surveyor's benchmark: the brass disc that is physically set into
            the ground at a point somebody measured, with the station triangle
            struck on it and the exact coordinate at its centre. It is the one
            map glyph whose whole meaning is "this point was established" —
            which is what a place in a photographic archive is.
            It replaced four focus brackets. Brackets aim; they are the
            vocabulary of a reticle, and a reticle is about to take a shot at
            something. This disc does not point anywhere: it IS the point. */}
        <svg className="af-point__landmark" viewBox={LANDMARK_VIEWBOX} aria-hidden="true">
          <g className="af-point__landmark-g">
            {/* THE DISC — what a place wears by default, and keeps for good if
                nobody ever draws it. At rest a mark is 16px across, and six
                hairline drawings at 16px are six identical grey smudges, so the
                far state is deliberately the same for every place: calm,
                legible, and honest about being a surveyed point.
                The body is opaque enough that the route hairline passes BEHIND
                the disc rather than through the ring and out the other side.
                The station triangle is dropped where a real landmark exists —
                it is the generic stand-in, and two landmarks on one point is
                one too many. */}
            <g className="af-point__disc">
              <circle className="af-point__landmark-body" r="11" />
              <circle className="af-point__landmark-halo" r="11" />
              {!landmark && <path className="af-point__landmark-halo" d="M0,-5.6 4.85,2.8 -4.85,2.8Z" />}
              <circle className="af-point__landmark-ring" r="11" />
              <circle className="af-point__landmark-inner" r="8.6" />
              {!landmark && <path className="af-point__landmark-station" d="M0,-5.6 4.85,2.8 -4.85,2.8Z" />}
              <path className="af-point__landmark-ticks" d="M0,-11V-15.4 M11,0H15.4 M0,11V15.4 M-11,0H-15.4" />
              <circle className="af-point__landmark-pip" r="1.5" />
            </g>
            {/* THE LANDMARK — drawn only once the camera is on its way here, so
                the detail arrives with the attention that can read it. Authored
                standing on y=0 and lifted, because the Marker anchors `center`:
                a glyph left standing on the origin would hang entirely above
                its own coordinate. */}
            {landmark && (
              <g className="af-place" transform={`translate(0 ${landmarkLift(landmark)})`}>
                {landmark.body && <path className="af-place__body" d={landmark.body} />}
                <g className="af-place__silhouette" dangerouslySetInnerHTML={{ __html: landmark.silhouette }} />
                <g className="af-place__full" dangerouslySetInnerHTML={{ __html: landmark.full }} />
              </g>
            )}
          </g>
        </svg>
        <span className="af-point__label" aria-hidden="true">
          {String(number).padStart(2, '0')}&nbsp;·&nbsp;{name}
        </span>
      </button>
    </motion.span>
  );
}
