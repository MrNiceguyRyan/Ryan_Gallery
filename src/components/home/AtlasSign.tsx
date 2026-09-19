import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { motion, type MotionValue } from 'framer-motion';

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
const latitudeLabel = (latitude: number) => `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}`;
const longitudeLabel = (longitude: number) => `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`;

/** Reticle scale through a hunt that locks at `lock` ms (u = ms since take-off). */
function reticleScale(u: number, lock: number): number {
  const snapStart = Math.max(420, lock - SNAP_MS);
  const hunting = (t: number) => {
    if (t < 140) return lerp(1, 0.92, easeOutQuad(t / 140));
    if (t < 420) return lerp(0.92, 1.95, easeOutCubic(progress(140, 420, t)));
    const w = t - 420;
    return 1.64 + 0.31 * Math.cos((TAU * w) / 360) * (0.55 + 0.45 * Math.exp(-w / 600));
  };
  if (u < snapStart) return hunting(u);
  if (u < lock) return lerp(hunting(snapStart), 0.86, easeInQuart(progress(snapStart, lock, u)));
  const k = u - lock;
  return 1 - 0.14 * Math.exp(-k / 115) * Math.cos((k / 1000) * TAU * 3.1);
}

/**
 * AtlasViewfinder — the current place, named the way a camera would: four
 * focus brackets locked on the point, an electronic level with the latitude
 * and longitude under its ends, the year on the top-right bracket, the name
 * and one readout line below.
 *
 * When the atlas flies to the next place the autofocus hunts — the brackets
 * pinch, spring wide and breathe, the centre "+" turns to an unsure "×", the
 * level wobbles, the coordinates count across and the new name shows only as
 * an out-of-focus ghost — then, at touchdown, it snaps tight with a single
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
  const bracketHaloRef = useRef<SVGPathElement>(null);
  const bracketRef = useRef<SVGPathElement>(null);
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
      ['is-lime', pad2(place.number)],
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
    const hunt = moving ? bell(t, 120, 330, lock - 190, lock - 20) : 0;
    const huntingNow = moving && t > 120 && t < lock;
    const scale = moving ? reticleScale(t, lock) : 1;
    const breathe = hunt * 0.13 * Math.sin((TAU * (t - 140)) / 380);
    const hw = HALF_W * scale * (1 + breathe);
    const hh = HALF_H * scale * (1 - breathe);
    const dx = 15 * hunt * Math.sin((TAU * t) / 560 + 0.6);
    const dy = 9 * hunt * Math.sin((TAU * t) / 430 + 2.1);
    let lime = 0;
    if (moving && t >= lock - 10) {
      lime = t < lock + 6
        ? progress(lock - 10, lock + 6, t)
        : t < lock + 160
          ? 1
          : 1 - easeInOutSine(progress(lock + 160, lock + SETTLE_MS, t));
    }
    const color = mixColor(lime);
    const arm = 14 * clamp(0.72 + 0.28 * scale, 0.7, 1.4);
    const stroke = huntingNow ? lerp(1.25, 1, bell(t, 120, 300, lock - 190, lock)) : 1.25 + lime;
    const bracketOpacity = huntingNow ? lerp(1, 0.78, bell(t, 120, 300, lock - 190, lock)) : 1;

    let bracketPath = '';
    let topRightX = cx + hw;
    let topRightY = cy - hh;
    ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).forEach(([sx, sy], k) => {
      const jx = 3.4 * hunt * Math.sin((TAU * t) / (170 + k * 23) + k * 1.7);
      const jy = 2.8 * hunt * Math.sin((TAU * t) / (190 + k * 19) + k * 2.3);
      const x = cx + dx + sx * hw + jx;
      const y = cy + dy + sy * hh + jy;
      if (k === 1) {
        topRightX = x;
        topRightY = y;
      }
      bracketPath += `M${x.toFixed(2)},${(y - sy * arm).toFixed(2)}L${x.toFixed(2)},${y.toFixed(2)}L${(x - sx * arm).toFixed(2)},${y.toFixed(2)}`;
    });
    bracketHaloRef.current?.setAttribute('d', bracketPath);
    bracketHaloRef.current?.setAttribute('stroke-width', (stroke + 2).toFixed(2));
    bracketRef.current?.setAttribute('d', bracketPath);
    bracketRef.current?.setAttribute('stroke-width', stroke.toFixed(2));
    if (bracketRef.current) {
      bracketRef.current.style.stroke = color;
      bracketRef.current.style.opacity = String(bracketOpacity);
    }
    if (bracketHaloRef.current) bracketHaloRef.current.style.opacity = String(bracketOpacity * (1 - 0.5 * lime));

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
      crossPath += `M${(cx + dx + ca * inner).toFixed(2)},${(cy + dy + sa * inner).toFixed(2)}L${(cx + dx + ca * outer).toFixed(2)},${(cy + dy + sa * outer).toFixed(2)}`;
    }
    crossHaloRef.current?.setAttribute('d', crossPath);
    crossRef.current?.setAttribute('d', crossPath);
    if (crossRef.current) {
      crossRef.current.style.stroke = color;
      crossRef.current.style.opacity = String(huntingNow ? 0.55 : 0.9 + 0.1 * lime);
    }

    // Electronic level: tilts while hunting, levels (with a small wobble) on lock.
    let tilt = 0;
    if (moving) {
      tilt = t < lock
        ? hunt * (3.4 * Math.sin((TAU * t) / 640 + 0.4) + 1.1 * Math.sin((TAU * t) / 250))
        : 1.3 * Math.exp(-(t - lock) / 120) * Math.sin((TAU * (t - lock)) / 300);
    }
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

    // Name: the focus pull.
    const name = nameRef.current;
    if (name) {
      let opacity = 1;
      let blur = 0;
      let tracking = -0.01;
      let nameScale = 1;
      if (switching && t < 300) {
        setName(from);
        const p = easeInCubic(progress(0, 280, t));
        opacity = 1 - p;
        blur = 10 * p;
        tracking = -0.01 + 0.1 * p;
        nameScale = 1 + 0.03 * p;
      } else {
        setName(to);
        if (switching && t < lock) {
          const focus = clamp((scale - 0.86) / 0.92);
          opacity = 0.62 * easeOutCubic(progress(Math.min(560, lock - 260), Math.min(820, lock), t));
          blur = 1.6 + 3.6 * focus;
          tracking = -0.01 + 0.08 * focus;
          nameScale = 1 + 0.03 * focus;
        } else if (switching) {
          const q = easeOutCubic(progress(lock, lock + 240, t));
          opacity = lerp(0.62, 1, q);
          blur = 1.6 * (1 - q);
        }
      }
      name.style.opacity = opacity.toFixed(3);
      name.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
      name.style.letterSpacing = `${tracking.toFixed(4)}em`;
      name.style.transform = `translate(${cx}px, ${cy + NAME_TOP}px) translateX(-50%) scale(${nameScale.toFixed(4)})`;
    }

    // Readout line: blanks right to left on take-off, types back in after the lock.
    setMeta(switching && t < 300 ? from : to);
    if (metaRef.current) metaRef.current.style.transform = `translate(${cx}px, ${cy + META_TOP}px) translateX(-50%)`;
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
  // column's right edge, 48px from the top, inside the 2rem canvas bleed.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const s = state.current;
      s.focalX = (root.clientWidth - 264) / 2;
      s.focalY = root.clientHeight / 2 + 24;
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
          <path ref={levelHaloRef} className="viewfinder__halo" strokeWidth={3} style={{ opacity: 0.6 }} />
          <path ref={levelRef} className="viewfinder__line" strokeWidth={1} />
        </g>
        <path ref={bracketHaloRef} className="viewfinder__halo" />
        <path ref={bracketRef} className="viewfinder__line" />
        <path ref={crossHaloRef} className="viewfinder__halo" strokeWidth={3} />
        <path ref={crossRef} className="viewfinder__line" strokeWidth={1.25} />
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
 * Every other place on the map carries an inactive AF point: a small hollow
 * square with its chapter number. The current place hides its point (the
 * viewfinder is locked there); a place the camera leaves lights its point
 * with one quick blink.
 */
export function AfPoint({ number, current, visibility }: {
  number: number;
  current: boolean;
  visibility: MotionValue<number>;
}) {
  return (
    <motion.span aria-hidden="true" className="af-point" style={{ opacity: visibility }}>
      <span className={`af-point__mark ${current ? 'is-current' : ''}`}>
        <span className="af-point__square" />
        <span className="af-point__number">{String(number).padStart(2, '0')}</span>
      </span>
    </motion.span>
  );
}
