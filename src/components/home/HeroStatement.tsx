import { useEffect, useRef } from 'react';
import {
  motion, useScroll, useTransform, useVelocity, useSpring, useMotionValue,
  useReducedMotion, type MotionValue,
} from 'framer-motion';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const expo = [0.16, 1, 0.3, 1] as const;

/* The dominant statement, as big lines. `lime` marks the accent payoff line;
 * `depth` is the mouse-parallax amount (px) — alternating for a layered feel. */
const LINES = [
  { text: 'A RECORD OF', lime: false, depth: 46 },
  { text: 'LIGHT &', lime: false, depth: -32 },
  { text: 'PLACE.', lime: true, depth: 62 },
];

function BigLine({
  line, i, skew, mouseX, exitY, reduce,
}: {
  line: (typeof LINES)[number];
  i: number;
  skew: MotionValue<number>;
  mouseX: MotionValue<number>;
  exitY: MotionValue<number>;
  reduce: boolean;
}) {
  // Mouse parallax (per-line depth) + a share of the scroll-exit lift.
  const px = useTransform(mouseX, [-1, 1], [-line.depth, line.depth]);
  const py = useTransform(exitY, (v) => v * (0.7 + i * 0.22)); // deeper lines lift more
  return (
    <span className="block overflow-visible whitespace-nowrap">
      <motion.span
        className="block will-change-transform"
        style={reduce ? undefined : { x: px, y: py, skewX: skew }}
        initial={reduce ? undefined : { opacity: 0, y: 48 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: expo, delay: 0.15 + i * 0.13 }}
      >
        {line.lime ? <span style={{ color: ACCENT }}>{line.text}</span> : line.text}
      </motion.span>
    </span>
  );
}

/**
 * HeroStatement — a monumental kinetic-type opener on the clean dark canvas.
 * The statement fills the screen at display scale and reacts three ways:
 * scroll-VELOCITY skew (leans into the scroll, springs back), MOUSE parallax
 * (each line drifts at its own depth), and a staggered rise-in on load (no
 * mask). On scroll it lifts + fades, handing off to the archive. Reduced
 * motion = big static type.
 */
export default function HeroStatement({
  collections,
  frames,
  places,
}: {
  collections: number;
  frames: number;
  places: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  // Scroll-velocity → skew (leans opposite the scroll direction, then settles).
  const { scrollY, scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const { scrollY: pageScrollY } = useScroll();
  const velocity = useVelocity(pageScrollY);
  // Stronger + more reactive skew, plus a horizontal "throw" — the block leans
  // AND slides with scroll velocity, then springs back hard.
  const skewRaw = useTransform(velocity, [-2200, 0, 2200], [7, 0, -7], { clamp: true });
  const skew = useSpring(skewRaw, { stiffness: 260, damping: 21, mass: 0.5 });
  const throwRaw = useTransform(velocity, [-2200, 0, 2200], [-70, 0, 70], { clamp: true });
  const throwX = useSpring(throwRaw, { stiffness: 220, damping: 23, mass: 0.5 });

  // Mouse parallax driver (-1..1 across the viewport), spring-smoothed.
  const mxRaw = useMotionValue(0);
  const mouseX = useSpring(mxRaw, { stiffness: 60, damping: 16, mass: 0.6 });
  useEffect(() => {
    if (reduce) return;
    const onMove = (e: MouseEvent) => mxRaw.set((e.clientX / window.innerWidth - 0.5) * 2);
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [reduce, mxRaw]);

  // Scroll exit — the whole overlay lifts + fades into the archive.
  const exitY = useTransform(scrollYProgress, [0, 1], [0, -140]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.72], [1, 0]);
  const cueOpacity = useTransform(scrollY, [0, 180], [1, 0], { clamp: true });

  return (
    <header ref={ref} className="relative h-[100svh] min-h-[620px] w-full overflow-hidden">
      <motion.div
        className="absolute inset-0 z-10 flex flex-col justify-between px-6 pt-28 pb-10 md:px-12 md:pb-14"
        style={reduce ? undefined : { opacity: overlayOpacity }}
      >
        {/* Top — masthead chrome */}
        <motion.div
          className="flex items-start justify-between gap-4"
          initial={reduce ? undefined : { opacity: 0, y: 14 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: expo, delay: 0.1 }}
        >
          <span className="font-serif uppercase tracking-[0.16em] text-base md:text-xl text-[#F4F4ED]">
            Journal&nbsp;Gallery
          </span>
          <span className="text-eyebrow text-right leading-[1.8] hidden sm:block">
            Visual&nbsp;Archive
            <br />
            Nº&nbsp;{String(collections).padStart(2, '0')} · {frames}&nbsp;frames
          </span>
        </motion.div>

        {/* The monumental statement */}
        <div className="flex-1 flex flex-col justify-center">
          <motion.p
            className="text-eyebrow mb-6 md:mb-8"
            style={{ color: ACCENT }}
            initial={reduce ? undefined : { opacity: 0 }}
            animate={reduce ? undefined : { opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.8 }}
          >
            Visual Archive · {places} places
          </motion.p>
          <motion.h1
            className="font-serif uppercase text-[#F4F4ED] tracking-[-0.02em] will-change-transform"
            style={{ fontSize: 'clamp(44px, 10vw, 150px)', lineHeight: 0.86, ...(reduce ? {} : { x: throwX }) }}
          >
            {LINES.map((line, i) => (
              <BigLine key={i} line={line} i={i} skew={skew} mouseX={mouseX} exitY={exitY} reduce={!!reduce} />
            ))}
          </motion.h1>
        </div>

        {/* Bottom — scroll cue */}
        <motion.div
          className="flex items-center gap-4 text-eyebrow"
          style={reduce ? undefined : { opacity: cueOpacity }}
          initial={reduce ? undefined : { opacity: 0 }}
          animate={reduce ? undefined : { opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.8 }}
        >
          <span>Scroll to enter the archive</span>
          <span className="w-12 h-px" style={{ background: 'rgba(244,244,237,0.4)' }} />
        </motion.div>
      </motion.div>
    </header>
  );
}
