import { motion, useReducedMotion } from 'framer-motion';
import Magnetic from './shared/Magnetic';

interface Props {
  currentPath: string;
  scrim?: boolean;
}

const links = [
  { href: '/', label: 'Home' },
  { href: '/travel', label: 'Map' },
  { href: '/about', label: 'About' },
];

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
          className="inline-flex min-h-11 min-w-11 items-center font-serif uppercase text-lg md:text-xl tracking-[0.16em] font-medium leading-none text-[#F4F4ED] mix-blend-difference hover:opacity-60 transition-opacity duration-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
        >
          Ryan Xu
        </a>

        {/* Right: direct destination pills */}
        <div className="flex items-center gap-2 md:gap-3">
          {links.filter(l => l.href !== cur).map((link) => (
            <Magnetic key={link.href} strength={0.32}>
              <motion.a
                whileHover={reduce ? undefined : { scale: 1.05 }}
                whileTap={reduce ? undefined : { scale: 0.95 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                href={link.href}
                data-astro-prefetch={link.href === '/travel' || link.href === '/' ? 'hover' : undefined}
                className="inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-full border border-white/10 bg-[#171b15]/80 px-3.5 text-[9px] font-bold uppercase tracking-[0.25em] text-white shadow-[0_10px_34px_rgba(7,9,6,0.18)] transition-colors duration-300 hover:bg-[#171b15]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00] md:min-w-[5.5rem] md:bg-[#171b15]/60 md:px-6 md:text-[10px] md:tracking-[0.3em] md:backdrop-blur-xl md:hover:bg-[#171b15]/75"
              >
                {link.label}
              </motion.a>
            </Magnetic>
          ))}
        </div>
      </nav>
  );
}
