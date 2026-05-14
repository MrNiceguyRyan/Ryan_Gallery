import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  currentPath: string;
  dark?: boolean;
}

const links = [
  { href: '/', label: 'Home' },
  { href: '/travel', label: 'Map' },
  { href: '/about', label: 'About' },
];

export default function Nav({ currentPath, dark = false }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Unified nav — matches homepage style: signature name left, pill buttons right */}
      <nav className="fixed top-0 left-0 w-full z-50 px-6 py-6 md:px-12 flex justify-between items-center bg-transparent">
        {/* Left: signature name */}
        <a
          href="/"
          className="font-signature text-3xl md:text-4xl text-[#FDFDFB] mix-blend-difference hover:opacity-60 transition-all"
        >
          Ryan Xu
        </a>

        {/* Right: pill buttons (desktop) */}
        <div className="hidden md:flex items-center gap-2 md:gap-3">
          {links.filter(l => l.href !== currentPath).map((link) => (
            <motion.a
              key={link.href}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href={link.href}
              className="px-4 md:px-6 py-2 rounded-full text-[10px] uppercase tracking-[0.3em] font-bold transition-all duration-500 border border-white/20 bg-white/5 hover:bg-white/10 text-white backdrop-blur-md mix-blend-difference"
            >
              {link.label}
            </motion.a>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-1"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          <motion.span
            className="block w-5 h-px origin-center bg-white mix-blend-difference"
            animate={mobileOpen ? { rotate: 45, y: 3.5 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.3 }}
          />
          <motion.span
            className="block w-5 h-px bg-white mix-blend-difference"
            animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
          <motion.span
            className="block w-5 h-px origin-center bg-white mix-blend-difference"
            animate={mobileOpen ? { rotate: -45, y: -3.5 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.3 }}
          />
        </button>
      </nav>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-[#0A0A0A]/97 backdrop-blur-2xl flex flex-col items-center justify-center gap-0 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
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
                const isActive = currentPath === link.href || (link.href !== '/' && currentPath.startsWith(link.href));
                return (
                  <motion.a
                    key={link.href}
                    href={link.href}
                    className={`w-full text-center py-5 text-2xl font-[200] tracking-[0.15em] transition-colors border-b border-white/5 last:border-0 ${
                      isActive ? 'text-white' : 'text-white/40 hover:text-white/80'
                    }`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ delay: i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </motion.a>
                );
              })}
            </div>

            {/* Footer in menu */}
            <motion.p
              className="absolute bottom-10 text-[10px] text-white/15 font-mono tracking-[0.3em] uppercase"
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
