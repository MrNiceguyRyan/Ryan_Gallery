/**
 * The Long Exposure (photo-graphein) — the homepage background IS a photograph
 * being taken.
 *
 * One point of light ignites and writes a single monumental calligraphic
 * stroke across the viewport. Its trail ACCUMULATES like light on film — never
 * erased, only settling into a dim ember — so the screen visibly becomes an
 * exposure in progress. The gesture's skeleton is the archive's itinerary
 * (waypoint k = city k, in on-screen order); as the head passes each waypoint
 * the component stamps the city's real EXIF beside it. Scrolling closes the
 * shutter: the light dies, the plate freezes, and a faint ghost of the whole
 * journey stays behind the photographs.
 *
 * Discipline (from the design review — do not "improve" these):
 * - The path is AUTHORED per orientation, not a lat/lng projection.
 * - All luminance ramps are ≥600ms and monotonic. No flashing, ever — the
 *   head fades to zero before any position jump (pass 2, resume).
 * - ZERO per-frame randomness. The grain tile is generated once, never reseeded.
 * - Exactly one moving object on screen at any time.
 * - Trail alphas are fixed constants; do not fatten the bloom or it collapses
 *   into the neon-comet cliché this concept exists to invert.
 * - prefers-reduced-motion renders the FINISHED plate (a designed still).
 *
 * All choreography lives in ARC-LENGTH fraction space; sample lookups go
 * through the inverse arc LUT (Catmull-Rom samples are uniform in parameter,
 * NOT in arc length — index-space math misplaces everything).
 */

export interface ExposureStop {
  /** City name, uppercased for the stamp. */
  label: string;
  /** EXIF line, e.g. "24mm · ƒ/11 · ISO 64" (may be empty). */
  exif: string;
}

export interface ExposureHooks {
  /** Fired on (re)layout with each stop's anchor in CSS px. */
  onLayout: (positions: { x: number; y: number }[]) => void;
  /** Fired once when the head reaches stop k (arm its 800ms CSS fade-in). */
  onArrive: (k: number) => void;
}

/* ── Authored gestures (normalized 0..1) ──
 * Hand-placed control points: one confident calligraphic sweep that threads
 * the band between the masthead (y < ~0.14) and the statement (y > ~0.56).
 * Order is the archive order; geometry is composition, NOT geography. */
const GESTURE_LANDSCAPE: [number, number][] = [
  // Monotonic in x (no hairpins — Catmull-Rom overshoots at direction
  // reversals); the calligraphy comes from the y undulation: a ridge-wave
  // rising out of the left, cresting, diving, settling right-center.
  [0.06, 0.44], // ignition — left-center, above the statement block
  [0.52, 0.19], // the big 1.6s diagonal sweep brakes here, high-center
  [0.64, 0.38], // dive
  [0.76, 0.21], // crest
  [0.86, 0.42], // dive
  [0.95, 0.28], // journey's end — settles right
];
const GESTURE_PORTRAIT: [number, number][] = [
  // Monotonic in y (rising bottom → top); x carries the undulation.
  [0.14, 0.56],
  [0.72, 0.47],
  [0.28, 0.40],
  [0.74, 0.31],
  [0.34, 0.24],
  [0.80, 0.17],
];

/* ── Frozen look constants (saturating accumulation; review-locked) ── */
const CORE = '244, 244, 237';
const A_CORE = 0.5; // live core stroke (2px, source-over)
const A_MID = 0.14; // live mid glow (10px, additive)
const A_BLOOM = 0.05; // live outer bloom (28px, additive; dropped on mobile)
const SETTLED = { core: 0.28, mid: 0.08, bloom: 0.04 }; // finished-plate intensity
const DECAY_ALPHA = 0.016; // destination-out step…
const DECAY_EVERY = 6; // …every N frames (8-bit-safe; quantization = ember floor)

/* ── Choreography (seconds; ramps are minimums, not suggestions) ── */
const T_HELD = 0.4; // held breath — nothing moves
const T_IGNITE = 0.6; // ease-out bloom from true zero (also every re-bloom)
const T_DRAG = 0.2; // slow drag before the sweep
const T_SWEEP = 1.6; // the viewport-crossing write, hard brake at stop 1
const T_LEG = 8; // cruise seconds per remaining leg
const T_DWELL = 1.2; // pause on each waypoint (stamp fades in)
const T_HOLD = 3; // rest after the journey (head fades out inside this)
const T_LEG2 = 10; // second (bracketing) pass — slower, 60% intensity
const PASS2 = { scale: 0.85, dy: 0.06, intensity: 0.6 };
const HEAD_A = 0.9; // cruise alpha — constant, never oscillates

const SAMPLES_PER_SEG = 48;

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInQuad = (x: number) => x * x;
const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/* Catmull-Rom through every control point, sampled to a flat polyline. */
function sampleGesture(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < SAMPLES_PER_SEG; s++) {
      const u = s / SAMPLES_PER_SEG;
      const u2 = u * u;
      const u3 = u2 * u;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
      });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

interface Seg { t0: number; t1: number; s0: number; s1: number; ease: (x: number) => number; }

export function startExposure(
  canvas: HTMLCanvasElement,
  stops: ExposureStop[],
  hooks: ExposureHooks,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx || stops.length < 2) return () => {};

  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = getComputedStyle(document.documentElement);
  const cssVar = (name: string, fb: string) => root.getPropertyValue(name).trim() || fb;
  const LIME = `${cssVar('--accent-r', '210')}, ${cssVar('--accent-g', '255')}, ${cssVar('--accent-b', '0')}`;

  /* ── Static grain tile — generated ONCE, never reseeded. ── */
  const grain = document.createElement('canvas');
  grain.width = grain.height = 256;
  {
    const g = grain.getContext('2d')!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0; // init-time only — the rAF loop has NO randomness
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  /* ── Light head sprite — pre-rendered once; alpha is set at draw time. ── */
  const SPRITE = 64;
  const head = document.createElement('canvas');
  head.width = head.height = SPRITE;
  {
    const g = head.getContext('2d')!;
    const c = SPRITE / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, `rgba(${CORE}, 1)`);
    grad.addColorStop(0.09, `rgba(${CORE}, 0.9)`);
    grad.addColorStop(0.3, `rgba(${LIME}, 0.5)`);
    grad.addColorStop(0.7, `rgba(${LIME}, 0.12)`);
    grad.addColorStop(1, `rgba(${LIME}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
  }

  /* ── Layout-dependent state ── */
  let w = 0, h = 0, dpr = 1, mobile = false;
  let pts: { x: number; y: number }[] = []; // sampled gesture, CSS px
  let arc: Float32Array = new Float32Array(0); // cumulative arc-fraction per sample
  let stopFrac: number[] = []; // arc fraction of each waypoint
  let stopIdx: number[] = []; // sample index of each waypoint
  let segs: Seg[] = []; // pass-1 choreography (arc space)
  let segs2: Seg[] = []; // pass-2 (bracketing) choreography
  const accum = document.createElement('canvas'); // the exposure plate
  const staticLayer = document.createElement('canvas'); // vignette + rebate + grain
  const actx = accum.getContext('2d')!;

  /* First sample index whose arc fraction >= s (binary search on the LUT). */
  const idxForArc = (s: number): number => {
    const target = clamp01(s);
    let lo = 0, hi = arc.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arc[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const transform2 = (p: { x: number; y: number }) => ({
    x: w / 2 + (p.x - w / 2) * PASS2.scale,
    y: h / 2 + (p.y - h / 2) * PASS2.scale + h * PASS2.dy,
  });

  /* Head position for an arc fraction — lerped between LUT samples. */
  const pointAtArc = (s: number, pass2 = false) => {
    const i = Math.max(1, idxForArc(s));
    const a0 = arc[i - 1];
    const a1 = arc[i];
    const u = a1 > a0 ? clamp01((clamp01(s) - a0) / (a1 - a0)) : 1;
    const p = {
      x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u,
      y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u,
    };
    return pass2 ? transform2(p) : p;
  };

  const buildTimeline = () => {
    segs = [];
    segs2 = [];
    const n = stops.length;
    let t = T_HELD + T_IGNITE;
    const drag = Math.min(0.02, stopFrac[1] * 0.15);
    segs.push({ t0: t, t1: t + T_DRAG, s0: 0, s1: drag, ease: easeInQuad });
    t += T_DRAG;
    segs.push({ t0: t, t1: t + T_SWEEP, s0: drag, s1: stopFrac[1], ease: easeInOutCubic });
    t += T_SWEEP + T_DWELL;
    for (let k = 2; k < n; k++) {
      segs.push({ t0: t, t1: t + T_LEG, s0: stopFrac[k - 1], s1: stopFrac[k], ease: easeInOutSine });
      t += T_LEG + T_DWELL;
    }
    t += T_HOLD;
    for (let k = 1; k < n; k++) {
      segs2.push({ t0: t, t1: t + T_LEG2, s0: stopFrac[k - 1], s1: stopFrac[k], ease: easeInOutSine });
      t += T_LEG2;
    }
  };

  const timelineEnd = () => (segs2.length ? segs2[segs2.length - 1].t1 : 0);

  const progressAt = (list: Seg[], t: number): number => {
    if (!list.length) return 0;
    if (t <= list[0].t0) return list[0].s0;
    for (const s of list) {
      if (t < s.t1) {
        if (t < s.t0) return s.s0; // dwell before this seg
        return s.s0 + (s.s1 - s.s0) * s.ease((t - s.t0) / (s.t1 - s.t0));
      }
    }
    return list[list.length - 1].s1;
  };

  /* Stroke samples [i0..i1] once. Butt caps on the additive glows so batch
   * joints don't double-deposit; the core is source-over (idempotent). */
  const strokeIdx = (
    c: CanvasRenderingContext2D,
    i0: number,
    i1: number,
    a: { core: number; mid: number; bloom: number },
    pass2 = false,
  ) => {
    if (i1 <= i0) return;
    const trace = () => {
      c.beginPath();
      const p0 = pass2 ? transform2(pts[i0]) : pts[i0];
      c.moveTo(p0.x, p0.y);
      for (let i = i0 + 1; i <= i1; i++) {
        const p = pass2 ? transform2(pts[i]) : pts[i];
        c.lineTo(p.x, p.y);
      }
      c.stroke();
    };
    c.lineJoin = 'round';
    // Glows are additive (lime channels clamp — crossings saturate to lime,
    // never white); the core is source-over so re-tracing cannot blow out.
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'butt';
    if (!mobile) {
      c.lineWidth = 28;
      c.strokeStyle = `rgba(${LIME}, ${a.bloom})`;
      trace();
    }
    c.lineWidth = 10;
    c.strokeStyle = `rgba(${LIME}, ${a.mid})`;
    trace();
    c.globalCompositeOperation = 'source-over';
    c.lineCap = 'round';
    c.lineWidth = 2;
    c.strokeStyle = `rgba(${CORE}, ${a.core})`;
    trace();
  };

  const paintStatic = () => {
    staticLayer.width = Math.round(w * dpr);
    staticLayer.height = Math.round(h * dpr);
    const s = staticLayer.getContext('2d')!;
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Grain — one static darkroom texture (0.04), painted once.
    s.globalAlpha = 0.04;
    s.fillStyle = s.createPattern(grain, 'repeat')!;
    s.fillRect(0, 0, w, h);
    s.globalAlpha = 1;
    // Vignette — 'camera dark' corners.
    const r = Math.hypot(w, h) / 1.7;
    const v = s.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.28, w / 2, h * 0.45, r);
    v.addColorStop(0, 'rgba(16, 18, 12, 0)');
    v.addColorStop(1, 'rgba(16, 18, 12, 0.35)');
    s.fillStyle = v;
    s.fillRect(0, 0, w, h);
    // Film rebate — a single hairline frame (skipped on narrow screens).
    if (w >= 480) {
      s.strokeStyle = `rgba(${CORE}, 0.06)`;
      s.lineWidth = 1;
      s.strokeRect(24.5, 24.5, w - 49, h - 49);
    }
  };

  /* Redraw the already-traversed exposure at settled intensity (resize / late
   * mount / reduced motion) — the plate survives layout changes. */
  const repaintPlate = (s1: number, s2: number) => {
    actx.setTransform(dpr, 0, 0, dpr, 0, 0);
    actx.clearRect(0, 0, w, h);
    if (s1 > 0) strokeIdx(actx, 0, idxForArc(s1), SETTLED);
    if (s2 > 0) {
      actx.globalAlpha = PASS2.intensity;
      strokeIdx(actx, 0, idxForArc(s2), SETTLED, true);
      actx.globalAlpha = 1;
    }
  };

  let arrived: boolean[] = stops.map(() => false);

  const layout = () => {
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    mobile = w < 640;
    dpr = mobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    accum.width = Math.round(w * dpr);
    accum.height = Math.round(h * dpr);
    actx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Author the gesture for this orientation, resample, measure arc length.
    const gesture = (h > w ? GESTURE_PORTRAIT : GESTURE_LANDSCAPE).map(([x, y]) => ({ x: x * w, y: y * h }));
    pts = sampleGesture(gesture);
    arc = new Float32Array(pts.length);
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      arc[i] = total;
    }
    for (let i = 0; i < arc.length; i++) arc[i] /= total || 1;

    // Waypoints: when the stop count matches the authored control points,
    // anchor each stop to its designed point; otherwise distribute evenly by
    // arc length (guarding strictly-increasing fractions → no dead legs).
    const n = stops.length;
    stopFrac = [];
    stopIdx = [];
    for (let k = 0; k < n; k++) {
      let f: number;
      if (n === gesture.length) {
        f = arc[Math.min(pts.length - 1, k * SAMPLES_PER_SEG)];
      } else {
        f = k / (n - 1);
      }
      if (k > 0) f = Math.max(f, stopFrac[k - 1] + 0.02);
      stopFrac.push(clamp01(f));
    }
    stopFrac[0] = 0;
    stopFrac[n - 1] = 1;
    for (let k = 0; k < n; k++) stopIdx.push(Math.min(pts.length - 1, idxForArc(stopFrac[k])));
    buildTimeline();
    paintStatic();
    hooks.onLayout(stopIdx.map((si) => ({ x: pts[si].x, y: pts[si].y })));
  };
  layout();

  const composite = (headS: number | null, headAlpha: number, pass2: boolean) => {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(staticLayer, 0, 0, w, h);
    ctx.drawImage(accum, 0, 0, w, h);
    if (headS != null && headAlpha > 0) {
      const p = pointAtArc(headS, pass2);
      ctx.globalAlpha = headAlpha;
      ctx.drawImage(head, p.x - SPRITE / 2, p.y - SPRITE / 2);
      ctx.globalAlpha = 1;
    }
  };

  /* ── Reduced motion: the FINISHED plate — a designed still. ── */
  if (reduce) {
    repaintPlate(1, 0);
    composite(1, 0.55, false);
    stops.forEach((_, k) => hooks.onArrive(k));
    const onResize = () => { layout(); repaintPlate(1, 0); composite(1, 0.55, false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }

  /* ── Live exposure loop ── */
  let raf = 0;
  let epoch = -1; // timeline zero (first frame timestamp)
  let lastFrame = 0;
  let frame = 0;
  let lastS1 = 0; // traversed arc, pass 1
  let lastS2 = 0; // traversed arc, pass 2
  let lastIdx1 = 0; // last accumulated sample index, pass 1 (each deposits once)
  let lastIdx2 = 0;
  let frozen = false;
  let frozenByScroll = false;
  let frozeAt = 0; // wall-clock when frozen (epoch shifts on resume)
  let resumeAt = -1; // timeline t when resumed (drives the 600ms re-bloom)
  let scrollY = window.scrollY || 0;

  const onScroll = () => { scrollY = window.scrollY || 0; };
  window.addEventListener('scroll', onScroll, { passive: true });

  const freeze = (byScroll: boolean) => {
    if (frozen) return;
    frozen = true;
    frozenByScroll = byScroll;
    frozeAt = performance.now();
    // Bake the plate WITHOUT the head (the light is off while the shutter is
    // closed); at the 0.6vh line the wrapper is at ~6% so this is invisible,
    // and it lets the resume re-bloom start clean instead of cutting a baked
    // head to zero.
    composite(null, 0, false);
  };

  // rAF is suspended in hidden tabs — the loop can never observe
  // document.hidden becoming true, so pausing must hook visibilitychange.
  const onVisibility = () => {
    if (document.hidden) freeze(false);
  };
  document.addEventListener('visibilitychange', onVisibility);

  let resizeT = 0;
  const onResize = () => {
    window.clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      layout();
      lastIdx1 = idxForArc(lastS1);
      lastIdx2 = idxForArc(lastS2);
      repaintPlate(lastS1, lastS2);
      // Recomposite even while frozen — layout() wiped the visible canvas
      // and the frozen loop won't redraw it.
      composite(null, 0, false);
    }, 150);
  };
  window.addEventListener('resize', onResize);

  // If mounted already scrolled past the shutter, show the finished ghost —
  // both passes complete, timeline parked at its end, so a later resume
  // re-blooms the parked head instead of replaying anything.
  if (scrollY > h * 0.6) {
    lastS1 = 1;
    lastS2 = 1;
    lastIdx1 = pts.length - 1;
    lastIdx2 = pts.length - 1;
    repaintPlate(1, 1);
    composite(null, 0, false);
    arrived = stops.map(() => true);
    stops.forEach((_, k) => hooks.onArrive(k));
    frozen = true;
    frozenByScroll = true;
    frozeAt = performance.now();
    epoch = frozeAt - timelineEnd() * 1000;
  }

  const freezeLine = () => h * 0.6; // shutter closes
  const resumeLine = () => h * 0.3; // hysteresis — re-opens well above

  const loop = (now: number) => {
    if (!canvas.isConnected) { stop(); return; }
    raf = requestAnimationFrame(loop);

    if (frozen) {
      // Scroll-freezes resume below the hysteresis line; visibility-freezes
      // resume anywhere the shutter isn't independently closed.
      const scrollOk = frozenByScroll ? scrollY < resumeLine() : scrollY < freezeLine();
      if (scrollOk && !document.hidden) {
        if (epoch < 0) {
          epoch = now; // never started — play the exposure from the held breath
        } else {
          epoch += now - frozeAt; // timeline resumes where it parked
          resumeAt = (now - epoch) * 0.001;
        }
        frozen = false;
      } else return; // plate is frozen — zero drawing work
    } else if (scrollY > freezeLine()) {
      freeze(true);
      return;
    }

    if (now - lastFrame < 24) return; // ~40fps is plenty for a slow exposure
    // Belt and braces: any silent stall (missed visibility event, OS sleep)
    // shifts the epoch instead of fast-forwarding the timeline — nothing may
    // ever pop in on one frame.
    if (lastFrame > 0 && now - lastFrame > 1000 && epoch >= 0) {
      epoch += now - lastFrame;
    }
    lastFrame = now;
    frame++;
    if (epoch < 0) epoch = now;
    const t = (now - epoch) * 0.001;

    // Decay — a small destination-out step every N frames. 8-bit quantization
    // floors the faint tail into a designed ember rather than erasing it.
    if (frame % DECAY_EVERY === 0) {
      actx.globalCompositeOperation = 'destination-out';
      actx.fillStyle = `rgba(0, 0, 0, ${DECAY_ALPHA})`;
      actx.fillRect(0, 0, w, h);
      actx.globalCompositeOperation = 'source-over';
    }

    // Advance the write; each sample deposits into the plate exactly once
    // (frame-rate and head-speed independent).
    const s1 = progressAt(segs, t);
    if (s1 > lastS1) {
      const i1 = idxForArc(s1);
      if (i1 > lastIdx1) {
        strokeIdx(actx, lastIdx1, i1, { core: A_CORE, mid: A_MID, bloom: A_BLOOM });
        lastIdx1 = i1;
      }
      lastS1 = s1;
    }
    const p2t0 = segs2.length ? segs2[0].t0 : Infinity;
    const inPass2 = t >= p2t0;
    let s2 = lastS2;
    if (inPass2) {
      s2 = progressAt(segs2, t);
      if (s2 > lastS2) {
        const i2 = idxForArc(s2);
        if (i2 > lastIdx2) {
          actx.globalAlpha = PASS2.intensity;
          strokeIdx(actx, lastIdx2, i2, { core: A_CORE, mid: A_MID, bloom: A_BLOOM }, true);
          actx.globalAlpha = 1;
          lastIdx2 = i2;
        }
        lastS2 = s2;
      }
    }

    // Arrivals (pass 1 only) — arm the EXIF stamps. Gated behind ignition so
    // stop 0's stamp blooms WITH the light, not before it.
    if (t >= T_HELD + T_IGNITE) {
      for (let k = 0; k < stopFrac.length; k++) {
        if (!arrived[k] && s1 >= stopFrac[k] - 0.002) {
          arrived[k] = true;
          hooks.onArrive(k);
        }
      }
    }

    // Head alpha envelope — every transition is a ≥600ms monotonic ramp:
    // true zero → ignition; fade OUT inside T_HOLD; pass-2 re-ignition at its
    // start point; the same ramp replays on every freeze→resume.
    let a = HEAD_A;
    if (t < T_HELD) a = 0;
    else if (t < T_HELD + T_IGNITE) a = HEAD_A * easeOutCubic((t - T_HELD) / T_IGNITE);
    const holdStart = p2t0 - T_HOLD;
    if (t >= holdStart && t < p2t0) {
      a = HEAD_A * (1 - easeInOutCubic(clamp01((t - holdStart) / T_IGNITE)));
    } else if (inPass2) {
      a = HEAD_A * PASS2.intensity * easeOutCubic(clamp01((t - p2t0) / T_IGNITE));
    }
    if (resumeAt >= 0 && t - resumeAt < T_IGNITE) {
      a = Math.min(a, HEAD_A * easeOutCubic(Math.max(0, t - resumeAt) / T_IGNITE));
    }

    composite(inPass2 ? s2 : s1, a, inPass2);
  };
  raf = requestAnimationFrame(loop);

  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearTimeout(resizeT);
  };
  return stop;
}
