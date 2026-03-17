import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Travel', href: '/travel' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export default function Nav({ currentPath }: { currentPath: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100/80">
        <div className="max-w-7xl mx-auto px-6 md:px-16 h-16 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
              <span className="text-white text-xs font-medium">R</span>
            </div>
            <span className="text-sm text-gray-500 font-light tracking-wider">Ryan</span>
          </a>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => {
              const isActive =
                currentPath === link.href ||
                (link.href !== '/' && currentPath.startsWith(link.href));
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`relative text-sm font-light tracking-wide transition-colors duration-300 pb-0.5 ${
                    isActive
                      ? 'text-gray-900'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-gray-900 rounded-full" />
                  )}
                </a>
              );
            })}
          </div>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden relative w-8 h-8 flex flex-col items-center justify-center gap-1.5"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            <motion.span
              className="w-5 h-[1px] bg-gray-900 block origin-center"
              animate={{
                rotate: isOpen ? 45 : 0,
                y: isOpen ? 3.5 : 0,
              }}
              transition={{ duration: 0.25 }}
            />
            <motion.span
              className="w-5 h-[1px] bg-gray-900 block origin-center"
              animate={{
                rotate: isOpen ? -45 : 0,
                y: isOpen ? -3.5 : 0,
              }}
              transition={{ duration: 0.25 }}
            />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 bg-white pt-24 px-8 md:hidden"
          >
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((link, i) => {
                const isActive = currentPath === link.href;
                return (
                  <motion.a
                    key={link.href}
                    href={link.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3 }}
                    className={`text-3xl font-extralight tracking-tight py-3 border-b border-gray-50 ${
                      isActive ? 'text-gray-900' : 'text-gray-400'
                    }`}
                    onClick={() => setIsOpen(false)}
                  >
                    {link.label}
                  </motion.a>
                );
              })}
            </div>

            <div className="mt-12 text-xs text-gray-300 font-mono">
              <p>Nikon Zf | Astro + React | Sanity CMS</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
