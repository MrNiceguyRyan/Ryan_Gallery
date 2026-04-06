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
            ? 'bg-white/80 backdrop-blur-2xl border-b border-gray-100/50'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        {/* Left spacer for centering */}
        <div className="flex-1" />

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
            className="fixed inset-0 z-40 bg-white/95 backdrop-blur-2xl flex flex-col items-center justify-center gap-8 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {links.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                className="text-lg uppercase tracking-[0.3em] font-medium text-gray-900"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </motion.a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
