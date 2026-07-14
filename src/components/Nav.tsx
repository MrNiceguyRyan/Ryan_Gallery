import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Magnetic from './shared/Magnetic';

interface Props {
  currentPath: string;
}

const links = [
  { href: '/', label: 'Home' },
  { href: '/travel', label: 'Map' },
  { href: '/about', label: 'About' },
];

export default function Nav({ currentPath }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduce = useReducedMotion();
  // Astro static builds emit trailing-slash paths ("/travel/"); normalize so
  // the exact-match filters below actually match and the current page's own
  // pill is hidden (it never matched before — every page showed itself).
  const cur = currentPath.length > 1 ? currentPath.replace(/\/+$/, '') : currentPath;

  return (
    <>
      {/* Unified nav — matches homepage style: signature name left, pill buttons right.
           Top padding honors iOS notch safe-area-inset so the signature isn't clipped
           under the dynamic island. */}
      <nav
        className="fixed top-0 left-0 w-full z-50 px-6 py-5 md:px-12 md:py-6 flex justify-between items-center bg-transparent"
        style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
      >
        {/* Left: signature name */}
        <a
          href="/"
          className="font-serif uppercase text-lg md:text-xl tracking-[0.16em] font-medium leading-none text-[#F4F4ED] mix-blend-difference hover:opacity-60 transition-opacity duration-200 py-1"
        >
          Ryan Xu
        </a>

        {/* Right: pill buttons (desktop) */}
        <div className="hidden md:flex items-center gap-2 md:gap-3">
          {links.filter(l => l.href !== cur).map((link) => (
            <Magnetic key={link.href} strength={0.5}>
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                href={link.href}
                className="inline-block px-4 md:px-6 py-2 rounded-full text-[10px] uppercase tracking-[0.3em] font-bold transition-colors duration-300 border border-white/10 bg-white/5 hover:bg-white/10 text-white backdrop-blur-md mix-blend-difference"
              >
                {link.label}
              </motion.a>
            </Magnetic>
          ))}
        </div>

        {/* Mobile hamburger — 44×44 tap target (Apple HIG minimum) */}
        <button
          className="md:hidden flex flex-col items-end justify-center gap-1.5 w-11 h-11 -mr-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          <motion.span
            className="block w-5 h-px origin-center bg-white mix-blend-difference"
            animate={mobileOpen ? { rotate: 45, y: 3.5 } : { rotate: 0, y: 0 }}
            transition={{ duration: reduce ? 0.01 : 0.3, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.span
            className="block w-5 h-px bg-white mix-blend-difference"
            animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.span
            className="block w-5 h-px origin-center bg-white mix-blend-difference"
            animate={mobileOpen ? { rotate: -45, y: -3.5 } : { rotate: 0, y: 0 }}
            transition={{ duration: reduce ? 0.01 : 0.3, ease: [0.16, 1, 0.3, 1] }}
          />
        </button>
      </nav>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-[#30352a]/97 backdrop-blur-2xl flex flex-col items-center justify-center gap-0 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Close button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-5 right-6 w-10 h-10 flex items-center justify-center text-white/30 hover:text-white/80 transition-colors"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Nav links */}
            <div className="flex flex-col items-center gap-1 w-full px-10">
              {links.map((link, i) => {
                const isActive = cur === link.href || (link.href !== '/' && cur.startsWith(link.href));
                return (
                  <motion.a
                    key={link.href}
                    href={link.href}
                    className={`w-full text-center py-5 text-4xl font-serif uppercase tracking-tight transition-colors border-b border-white/5 last:border-0 ${
                      isActive ? 'text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]' : 'text-white/40 hover:text-white/80'
                    }`}
                    initial={{ opacity: 0, y: reduce ? 0 : 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduce ? 0 : -8 }}
                    transition={{ delay: reduce ? 0 : i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </motion.a>
                );
              })}
            </div>

            {/* Footer in menu */}
            <motion.p
              className="absolute bottom-10 text-[10px] text-white/15 font-ui tracking-[0.3em] uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.4 }}
            >
              Ryan Xu · Visual Archive
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
