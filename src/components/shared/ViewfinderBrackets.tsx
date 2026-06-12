import { motion, useReducedMotion } from 'framer-motion';

interface Props {
  /** Tailwind inset utilities for the four bracket positions.
   *  Default frames a full-viewport hero. Pass tighter values to wrap
   *  a smaller editorial block. */
  insetClass?: string;
  /** Inline color (CSS expression). Defaults to the page-level
   *  --accent-* CSS variables so brackets pick up the homepage's
   *  dynamic accent system. Pass an rgba string to override per page. */
  color?: string;
  /** Hide on small screens — useful when the hero region is already
   *  tight and four brackets would crowd the content. Defaults to false
   *  (visible on all viewports). */
  hideOnMobile?: boolean;
}

/**
 * Four corner L-shaped brackets that frame a region like a camera
 * viewfinder. Each corner breathes on a 7s loop with a 0.4s phase
 * offset so they pulse slightly out of sync.
 *
 * Shared between HomePage hero, AboutPage hero, and Travel ParallaxHero
 * so the site has one consistent "viewfinder framing" identity.
 */
export default function ViewfinderBrackets({
  insetClass = 'top-[7vh] left-[5vw] right-[5vw] bottom-[7vh]',
  color = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))',
  hideOnMobile = false,
}: Props) {
  // Parse the inset string into per-corner positioning. We pass the same
  // four directional utilities to all corners; only the path direction
  // differs. The brackets are sized 28px on mobile, 40px on md+.
  const corners = [
    { corner: 'top-left',     path: 'M0 28V0H28' },
    { corner: 'top-right',    path: 'M28 28V0H0'  },
    { corner: 'bottom-left',  path: 'M0 0V28H28'  },
    { corner: 'bottom-right', path: 'M28 0V28H0'  },
  ] as const;

  // Tailwind-style positioning per corner. We strip the inset string
  // into individual top/right/bottom/left utilities so each L lands
  // in the right corner of the framed region.
  function cornerPositioning(c: typeof corners[number]['corner']): string {
    const insets = insetClass.split(/\s+/);
    const top    = insets.find((s) => s.startsWith('top-'))    ?? 'top-0';
    const right  = insets.find((s) => s.startsWith('right-'))  ?? 'right-0';
    const bottom = insets.find((s) => s.startsWith('bottom-')) ?? 'bottom-0';
    const left   = insets.find((s) => s.startsWith('left-'))   ?? 'left-0';
    switch (c) {
      case 'top-left':     return `${top} ${left}`;
      case 'top-right':    return `${top} ${right}`;
      case 'bottom-left':  return `${bottom} ${left}`;
      case 'bottom-right': return `${bottom} ${right}`;
    }
  }

  const reduce = useReducedMotion();
  return (
    <>
      {corners.map((b, i) => (
        <motion.svg
          key={b.corner}
          className={`absolute ${cornerPositioning(b.corner)} w-[28px] h-[28px] md:w-[40px] md:h-[40px] pointer-events-none ${hideOnMobile ? 'hidden md:block' : ''}`}
          viewBox="0 0 28 28"
          fill="none"
          animate={reduce ? { opacity: 0.25 } : { opacity: [0.18, 0.32, 0.18] }}
          transition={reduce ? { duration: 0.3 } : {
            duration: 7,
            delay: i * 0.4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ color }}
          aria-hidden="true"
        >
          <path d={b.path} stroke="currentColor" strokeWidth="0.8" strokeLinecap="square" />
        </motion.svg>
      ))}
    </>
  );
}
