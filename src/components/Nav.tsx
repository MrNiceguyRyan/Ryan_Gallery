import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  currentPath: string;
}

const links = [
  { href: '/', label: 'Photography' },
  { href: '/travel', label: 'Journal' },
  { href: '/about', label: 'About' },
];

export default function Nav({ currentPath }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Home page has a dark hero — start transparent and transition to white on scroll
  const isHome = currentPath === '/';
  const [scrolled, setScrolled] = useState(!isHome);

  useEffect(() => {
    if (!isHome) return;
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHome]);

  return (
    <>
      <nav
        style={{ viewTransitionName: 'nav' }}
        className={`fixed top-0 left-0 w-full z-50 px-6 py-5 md:px-12 flex items-center transition-all duration-700 ${
          scrolled
            ? 'bg-white/75 backdrop-blur-2xl border-b border-white/40 shadow-[0_1px_0_rgba(0,0,0,0.04)]'
            : isHome
              ? 'bg-black/20 backdrop-blur-xl border-b border-white/10'
              : 'bg-white/75 backdrop-blur-2xl border-b border-white/40 shadow-[0_1px_0_rgba(0,0,0,0.04)]'
        }`}
      >
        {/* Left: aperture logo */}
        <div className="flex-1">
          <a href="/" aria-label="Home">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"
              className={`transition-opacity duration-700 hover:opacity-60 ${
                scrolled ? 'opacity-70' : 'opacity-80'
              }`}
            >
              <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <path d="M 16.00,11.80 L 19.64,13.90 L 19.64,18.10 L 16.00,20.20 L 12.36,18.10 L 12.36,13.90 Z" stroke="currentColor" strokeWidth="0.9" fill="none"/>
              <line x1="16.00" y1="11.80" x2="21.50" y2="6.47" stroke="currentColor" strokeWidth="0.8"/>
              <line x1="19.64" y1="13.90" x2="27.00" y2="16.00" stroke="currentColor" strokeWidth="0.8"/>
              <line x1="19.64" y1="18.10" x2="21.50" y2="25.53" stroke="currentColor" strokeWidth="0.8"/>
              <line x1="16.00" y1="20.20" x2="10.50" y2="25.53" stroke="currentColor" strokeWidth="0.8"/>
              <line x1="12.36" y1="18.10" x2="5.00" y2="16.00" stroke="currentColor" strokeWidth="0.8"/>
              <line x1="12.36" y1="13.90" x2="10.50" y2="6.47" stroke="currentColor" strokeWidth="0.8"/>
            </svg>
          </a>
        </div>

        {/* Center: name */}
        <a
          href="/"
          className={`text-xl md:text-2xl font-display tracking-[0.12em] hover:opacity-60 transition-all ${
            scrolled ? 'text-gray-900' : 'text-white'
          }`}
        >
          RYAN XU
        </a>

        {/* Right: nav links */}
        <div className="flex-1 flex justify-end items-center gap-6 md:gap-8">
          {links.map((link) => {
            const isActive = currentPath === link.href || (link.href !== '/' && currentPath.startsWith(link.href));
            return (
              <a
                key={link.href}
                href={link.href}
                className={`hidden md:block text-[11px] uppercase tracking-[0.2em] font-medium transition-all duration-700 hover:opacity-100 ${
                  isActive
                    ? scrolled ? 'text-gray-900' : 'text-white'
                    : scrolled
                      ? 'text-gray-400 hover:text-gray-900'
                      : 'text-white/50 hover:text-white'
                }`}
              >
                {link.label}
              </a>
            );
          })}

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-1"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            <motion.span
              className={`block w-5 h-px origin-center transition-colors duration-700 ${scrolled ? 'bg-gray-900' : 'bg-white'}`}
              animate={mobileOpen ? { rotate: 45, y: 3.5 } : { rotate: 0, y: 0 }}
              transition={{ duration: 0.3 }}
            />
            <motion.span
              className={`block w-5 h-px transition-colors duration-700 ${scrolled ? 'bg-gray-900' : 'bg-white'}`}
              animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
              transition={{ duration: 0.2 }}
            />
            <motion.span
              className={`block w-5 h-px origin-center transition-colors duration-700 ${scrolled ? 'bg-gray-900' : 'bg-white'}`}
              animate={mobileOpen ? { rotate: -45, y: -3.5 } : { rotate: 0, y: 0 }}
              transition={{ duration: 0.3 }}
            />
          </button>
        </div>
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
