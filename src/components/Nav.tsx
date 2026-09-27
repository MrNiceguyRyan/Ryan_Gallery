import { motion, useReducedMotion } from 'framer-motion';
import { DUR, EASE } from '../lib/motion';
import { NOTES_LIVE } from '../lib/notesNav';

interface Props {
  currentPath: string;
  scrim?: boolean;
}

// MAP · NOTES · ABOUT. NOTES only once a note is published (src/lib/notesNav).
const links = [
  { href: '/', label: 'Home' },
  { href: '/travel', label: 'Map' },
  ...(NOTES_LIVE ? [{ href: '/notes', label: 'Notes' }] : []),
  { href: '/about', label: 'About' },
];

/** The pills a page shows: every destination but the page itself. A page
 *  below a section (a note, /notes/<slug>) is none of them, so it keeps its
 *  section's pill — the way back to the list from the middle of an article —
 *  and lets the wordmark stand for Home: MAP · NOTES · ABOUT, the homepage's
 *  own set, and a phone's row stays at three. */
function pillsFor(path: string) {
  const others = links.filter((link) => link.href !== path);
  return others.length > 3 ? others.filter((link) => link.href !== '/') : others;
}

export default function Nav({ currentPath, scrim = false }: Props) {
  const reduce = useReducedMotion();
  // Astro static builds emit trailing-slash paths ("/travel/"); normalize so
  // the exact-match filters below actually match and the current page's own
  // pill is hidden (it never matched before — every page showed itself).
  const cur = currentPath.length > 1 ? currentPath.replace(/\/+$/, '') : currentPath;

  return (
    /* Unified nav — the same direct two-pill model as Homepage at every
       breakpoint. With only two destinations available on each inner page,
       a hidden mobile menu added a needless interaction and made the site's
       navigation feel inconsistent. */
      <nav
        aria-label="Primary navigation"
        data-site-nav
        className={`fixed top-0 left-0 w-full z-50 px-6 py-5 md:px-12 md:py-6 flex justify-between items-center ${
          scrim
            ? 'bg-[linear-gradient(180deg,rgba(40,44,32,0.96)_0%,rgba(40,44,32,0.84)_72%,transparent_100%)] backdrop-blur-[2px]'
            : 'bg-transparent'
        }`}
        style={{
          paddingTop: 'max(1.25rem, env(safe-area-inset-top))',
          paddingLeft: 'max(clamp(1.5rem, 3.35vw, 3rem), env(safe-area-inset-left))',
          paddingRight: 'max(clamp(1.5rem, 3.35vw, 3rem), env(safe-area-inset-right))',
        }}
      >
        {/* Left: signature name */}
        <a
          href="/"
          data-astro-prefetch="hover"
          aria-label="Ryan Xu — home"
          className="nav-wordmark inline-flex min-h-11 min-w-11 shrink-0 items-center whitespace-nowrap font-serif uppercase text-lg md:text-[21px] tracking-[0.1em] font-medium leading-none text-[#F4F4ED] mix-blend-difference hover:opacity-60 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
        >
          Ryan Xu
        </a>

        {/* Right: direct destination pills. They answer the pointer in
            background only (.nav-pill: 200 ms in, 400 ms out); chrome never
            scales, and a press gives 3%. Three pills and the wordmark need
            ~350px at the 72px pill: under 380px the pills close up to their
            labels (52px minimum, still a 44px-tall target). */}
        <div className="flex shrink-0 items-center gap-2 max-[379px]:gap-1.5 md:gap-3">
          {pillsFor(cur).map((link) => (
              <motion.a
                key={link.href}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                transition={{ duration: DUR.flick, ease: EASE.arrive }}
                href={link.href}
                data-astro-prefetch={link.href === '/travel' || link.href === '/' || link.href === '/notes' ? 'hover' : undefined}
                className="nav-pill inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-full border border-white/10 bg-[#171b15]/80 px-3.5 max-[379px]:min-w-[3.25rem] max-[379px]:px-2.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_10px_34px_rgba(7,9,6,0.18)] hover:bg-[#171b15]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00] md:min-w-[5.5rem] md:bg-[#171b15]/60 md:px-6 md:text-[10px] md:backdrop-blur-xl md:hover:bg-[#171b15]/75"
              >
                {link.label}
              </motion.a>
          ))}
        </div>
      </nav>
  );
}
