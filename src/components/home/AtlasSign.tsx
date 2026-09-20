import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';

/** Everything the viewfinder prints for a place. */
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
   * The camera has taken off toward `to`: the reticle hunts until `lockAt`
   * (a performance.now() timestamp — the flight's touchdown), then locks.
   * Calling it again mid-hunt retargets: same hunt, new subject and lock time.
   */
  hunt(to: ViewfinderPlace, lockAt: number): void;
}

// Geometry, measured from the atlas focal point (the place the camera rests on).
const HALF_W = 52;
const HALF_H = 36;
const ARM = 168;
const NAME_TOP = 45;
const META_TOP = 84;
// The lock settles (spring, readouts typing in, lime cooling) over this long.
/** Where the archive reads: the line a chapter's cover photograph sits on
 *  (HomePage scrolls a chapter to it), and therefore the line the map's focal
 *  point and the viewfinder must share — otherwise the brackets hold a place
 *  40-odd pixels below the photograph they belong to. */
export const ATLAS_READING_LINE = 0.48;

const SETTLE_MS = 510;
const SNAP_MS = 110;
const MIN_HUNT_MS = 600;

const BONE: [number, number, number] = [244, 244, 237];
const LIME: [number, number, number] = [210, 255, 0];
const TAU = Math.PI * 2;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const progress = (a: number, b: number, value: number) => clamp((value - a) / (b - a));
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInQuart = (t: number) => t ** 4;
const easeInCubic = (t: number) => t ** 3;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const bell = (u: number, a: number, b: number, c: number, d: number) =>
  u <= a || u >= d ? 0 : u < b ? easeInOutSine(progress(a, b, u)) : u > c ? 1 - easeInOutSine(progress(c, d, u)) : 1;
const mixColor = (t: number) =>
  `rgb(${BONE.map((channel, index) => Math.round(lerp(channel, LIME[index], t))).join(',')})`;

const pad2 = (value: number) => String(value).padStart(2, '0');

// Letters of a similar width in Fraunces, so the name barely changes width
// while its letters are shuffled.
const SCRAMBLE_GLYPHS = 'ACDEGHKNOPRSTUVXZ';
const SCRAMBLE_FLIP_MS = 55;
/** The name `from` shuffled into `to` at `t` ms of a hunt that locks at
 *  `lock`: letters start flipping from the left, each settles on its new
 *  letter in turn, the last one just before the lock. Each entry is the
 *  letter to show and whether it is still an unsettled glyph. */
function scrambledName(from: string, to: string, t: number, lock: number): Array<[string, boolean]> {
  const length = Math.max(from.length, to.length);
  const flip = Math.floor(t / SCRAMBLE_FLIP_MS);
  const out: Array<[string, boolean]> = [];
  for (let i = 0; i < length; i += 1) {
    const target = to[i];
    const start = lock * (0.05 + (0.25 * i) / length);
    const end = target != null ? lock * (0.48 + (0.5 * (i + 1)) / to.length) : start + 160;
    if (t < start) out.push([from[i] ?? SCRAMBLE_GLYPHS[(i * 7) % SCRAMBLE_GLYPHS.length], from[i] == null]);
    else if (t < end) out.push(target === ' ' ? [' ', false] : [SCRAMBLE_GLYPHS[(i * 7 + flip * 13 + 3) % SCRAMBLE_GLYPHS.length], true]);
    else if (target != null) out.push([target, false]);
  }
  return out;
}
const EARTH_RADIUS_KM = 6371;
function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
const formatKm = (km: number) => Math.round(km).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
const ARRIVAL_RING_MS = 480;
const latitudeLabel = (latitude: number) => `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}`;
const longitudeLabel = (longitude: number) => `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`;

/** Reticle scale through a hunt that locks at `lock` ms (u = ms since take-off). */
function reticleScale(u: number, lock: number): number {
  const snapStart = Math.max(420, lock - SNAP_MS);
  const hunting = (t: number) => {
    if (t < 140) return lerp(1, 0.94, easeOutQuad(t / 140));
    if (t < 460) return lerp(0.94, 1.72, easeOutCubic(progress(140, 460, t)));
    // Open, the brackets rack focus once — a slow, decaying in-and-out — and
    // then hold still until the snap. No sway, no jitter.
    const w = t - 460;
    return 1.6 + 0.12 * Math.cos((TAU * w) / 760) * Math.exp(-w / 700);
  };
  if (u < snapStart) return hunting(u);
  if (u < lock) return lerp(hunting(snapStart), 0.9, easeInQuart(progress(snapStart, lock, u)));
  const k = u - lock;
  return 1 - 0.1 * Math.exp(-k / 90) * Math.cos((k / 1000) * TAU * 2.6);
}

/**
 * AtlasViewfinder — the current place, named the way a camera would: four
 * focus brackets locked on the point, an electronic level with the latitude
 * and longitude under its ends, the year on the top-right bracket, the name
 * and one readout line below.
 *
 * When the atlas flies to the next place the autofocus hunts — the brackets
 * pinch, open wide and rack focus once, the centre "+" turns to an unsure
 * "×", the coordinates count across and the new name shows only as an
 * out-of-focus ghost — then, at touchdown, it snaps tight with a single
 * lime confirmation flash, the name comes into focus and the readouts type
 * back in. All drawing is imperative inside one rAF loop that runs only while
 * something moves; React renders the component once.
 */
export const AtlasViewfinder = forwardRef<ViewfinderHandle, {
  initial: ViewfinderPlace | null;
  visibility: MotionValue<number>;
  reducedMotion: boolean;
}>(function AtlasViewfinder({ initial, visibility, reducedMotion }, forwardedRef) {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const crossHaloRef = useRef<SVGPathElement>(null);
  const crossRef = useRef<SVGPathElement>(null);
  const levelGroupRef = useRef<SVGGElement>(null);
  const levelHaloRef = useRef<SVGPathElement>(null);
  const levelRef = useRef<SVGPathElement>(null);
  const yearRef = useRef<HTMLSpanElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lonRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const metaRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
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
    dashOffset: 0,
    nameSpans: [] as HTMLSpanElement[],
    /** The chapter number last shown in the readout, for the roll. */
    ordinalShown: null as number | null,
    legKm: null as HTMLSpanElement | null,
    metaChars: [] as HTMLSpanElement[],
    metaDot: null as HTMLElement | null,
    nameFor: '',
  });

  const setName = (place: ViewfinderPlace | null) => {
    const s = state.current;
    const node = nameRef.current;
    if (!node || !place || s.nameFor === place.id) return;
    node.textContent = place.name;
    s.nameFor = place.id;
  };

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
    const scale = moving ? reticleScale(t, lock) : 1;
    // The reticle stays centred on the focal point throughout: the camera is
    // what moves, so the brackets only change size (the rack in reticleScale),
    // never position.
    // The frame opens sideways while scanning — a wider field — but only a
    // little downward, so it never runs into the name set beneath it.
    const hw = HALF_W * scale;
    const hh = Math.min(HALF_H * scale, NAME_TOP - 6);
    let lime = 0;
    if (moving && t >= lock - 10) {
      lime = t < lock + 6
        ? progress(lock - 10, lock + 6, t)
        : t < lock + 160
          ? 1
          : 1 - easeInOutSine(progress(lock + 160, lock + SETTLE_MS, t));
    }
    const color = mixColor(lime);
    // The focus frame is not drawn here any more: it is the photograph's own
    // four corners, over in the chapter column (`.archive-focus`). A frame on
    // the map and a frame on the plate could only agree at one scroll
    // position, and the rest of the time read as two rectangles missing each
    // other. What stays on the map is the sign: the centre mark on the place,
    // the level with its coordinates, the year, the name and the readout.
    // `hw`/`hh` still describe the reticle's box, which the level's gap, the
    // year's anchor and the centre mark are all measured from.
    const topRightX = cx + hw;
    const topRightY = cy - hh;

    // Centre mark: "+" at rest, turns to "×" while unsure, snaps back on lock.
    const rotation = moving && t < lock
      ? 45 * easeInOutSine(progress(120, 300, t)) * (1 - easeInCubic(progress(lock - 70, lock, t)))
      : 0;
    const inner = 11 * (1 + 0.25 * (scale - 1));
    const outer = inner + 5;
    let crossPath = '';
    for (let k = 0; k < 4; k += 1) {
      const angle = ((k * 90 + rotation) * Math.PI) / 180;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      crossPath += `M${(cx + ca * inner).toFixed(2)},${(cy + sa * inner).toFixed(2)}L${(cx + ca * outer).toFixed(2)},${(cy + sa * outer).toFixed(2)}`;
    }
    crossHaloRef.current?.setAttribute('d', crossPath);
    crossRef.current?.setAttribute('d', crossPath);
    if (crossRef.current) {
      crossRef.current.style.stroke = color;
      crossRef.current.style.opacity = String(huntingNow ? 0.55 : 0.9 + 0.1 * lime);
    }

    // Electronic level: stays level through the hunt; one small, fast settle
    // as the lock lands.
    let tilt = 0;
    if (moving && t >= lock) tilt = 0.6 * Math.exp(-(t - lock) / 90) * Math.sin((TAU * (t - lock)) / 240);
    const gap = Math.max(hw, 40) + 12;
    const leftEnd = cx - ARM;
    const rightEnd = cx + ARM;
    const leftInner = Math.min(cx - gap, cx - 20);
    const rightInner = Math.max(cx + gap, cx + 20);
    let levelPath = '';
    if (leftInner - leftEnd > 4) levelPath += `M${leftEnd},${cy}L${leftInner.toFixed(2)},${cy}M${leftEnd},${cy - 4.5}L${leftEnd},${cy + 4.5}`;
    if (rightEnd - rightInner > 4) levelPath += `M${rightInner.toFixed(2)},${cy}L${rightEnd},${cy}M${rightEnd},${cy - 4.5}L${rightEnd},${cy + 4.5}`;
    levelHaloRef.current?.setAttribute('d', levelPath);
    levelRef.current?.setAttribute('d', levelPath);
    // The level's dashes run toward the destination while the camera flies
    // and stand still once it has landed.
    if (moving && t < lock && from && to) {
      const direction = Math.sign(to.coordinates[0] - from.coordinates[0]) || 1;
      s.dashOffset = -direction * t * 0.05;
    }
    levelHaloRef.current?.setAttribute('stroke-dashoffset', s.dashOffset.toFixed(1));
    levelRef.current?.setAttribute('stroke-dashoffset', s.dashOffset.toFixed(1));
    levelGroupRef.current?.setAttribute('transform', `rotate(${tilt.toFixed(3)} ${cx} ${cy})`);
    if (levelRef.current) {
      levelRef.current.style.stroke = color;
      levelRef.current.style.opacity = String(huntingNow ? 0.3 : 0.4 + 0.4 * lime);
    }

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

    // Name: the letters are shuffled into the next name while the camera
    // flies (see scrambledName); the last settles as the lock lands.
    const name = nameRef.current;
    if (name) {
      let opacity = 1;
      if (switching && from && to && t < lock) {
        // One span per letter, so unsettled glyphs can sit dimmer than the
        // letters already in place; kerning off, or the word hops as pairs
        // change.
        const letters = scrambledName(from.name, to.name, t, lock);
        if (s.nameFor !== '') {
          name.textContent = '';
          s.nameSpans = [];
          s.nameFor = '';
          name.style.fontKerning = 'none';
        }
        while (s.nameSpans.length < letters.length) {
          const span = document.createElement('span');
          name.appendChild(span);
          s.nameSpans.push(span);
        }
        while (s.nameSpans.length > letters.length) s.nameSpans.pop()?.remove();
        letters.forEach(([letter, dud], index) => {
          const span = s.nameSpans[index];
          if (span.textContent !== letter) span.textContent = letter;
          span.classList.toggle('is-dud', dud);
        });
        opacity = 0.94;
      } else {
        if (s.nameFor === '') {
          s.nameSpans = [];
          name.style.fontKerning = '';
        }
        setName(to);
        if (switching) opacity = lerp(0.94, 1, easeOutCubic(progress(lock, lock + 160, t)));
      }
      name.style.opacity = opacity.toFixed(3);
      name.style.transform = `translate(${cx}px, ${cy + NAME_TOP}px) translateX(-50%)`;
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
    // Arrival: one ring spreads from the focal point as the lock lands.
    if (ringRef.current) {
      const p = moving && t >= lock ? clamp((t - lock) / ARRIVAL_RING_MS) : 1;
      ringRef.current.setAttribute('cx', cx.toFixed(1));
      ringRef.current.setAttribute('cy', cy.toFixed(1));
      ringRef.current.setAttribute('r', (6 + 40 * easeOutCubic(p)).toFixed(1));
      ringRef.current.style.opacity = moving && t >= lock && p < 1 ? (0.85 * (1 - p)).toFixed(3) : '0';
    }
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
      s.focalY = ATLAS_READING_LINE * window.innerHeight - root.getBoundingClientRect().top;
      svgRef.current?.setAttribute('viewBox', `0 0 ${root.clientWidth} ${root.clientHeight}`);
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
      <span ref={scrimRef} className="viewfinder__scrim" />
      <svg ref={svgRef} className="viewfinder__svg">
        <g ref={levelGroupRef}>
          <path ref={levelHaloRef} className="viewfinder__halo" strokeWidth={3} strokeDasharray="4 4" style={{ opacity: 0.6 }} />
          <path ref={levelRef} className="viewfinder__line" strokeWidth={1} strokeDasharray="4 4" />
        </g>
        <path ref={crossHaloRef} className="viewfinder__halo" strokeWidth={3} />
        <path ref={crossRef} className="viewfinder__line" strokeWidth={1.25} />
        <circle ref={ringRef} className="viewfinder__ring" r={6} style={{ opacity: 0 }} />
      </svg>
      <span ref={yearRef} className="viewfinder__readout" />
      <span ref={latRef} className="viewfinder__readout" />
      <span ref={lonRef} className="viewfinder__readout" />
      <span ref={nameRef} className="viewfinder__name" />
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
 * Every other place on the map carries an inactive AF point: a small hollow
 * ring, the same mark the globe uses. At the current place it fills into the
 * white focus point in the gap of the viewfinder's centre cross; a place the
 * camera leaves lights its ring again with one quick blink.
 */
export function AfPoint({ stopId, number, name, initiallyCurrent, engaged, visibility, onEngage, onNavigate }: {
  stopId: string;
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
  const [initialClass] = useState(() => `af-point__mark${initiallyCurrent ? ' is-current' : ''}`);
  // Invisible points (the prologue, the entrance) must not be hit targets.
  const pointerEvents = useTransform(visibility, (value) => (value > 0.5 ? 'auto' : 'none'));
  return (
    <motion.span className="af-point" style={{ opacity: visibility, pointerEvents }}>
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
        <span className="af-point__ring" />
        <span className="af-point__dot" />
        <span className="af-point__focus" />
        <span className="af-point__label" aria-hidden="true">
          {String(number).padStart(2, '0')}&nbsp;·&nbsp;{name}
        </span>
      </button>
    </motion.span>
  );
}
