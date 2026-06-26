import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/**
 * SignatureIntro — a brief opening on the homepage: the lime script signature
 * "writes" itself on left→right over a deep-olive screen, holds, then the panel
 * lifts to reveal the page. Library-free: it's a clip-path wipe of the cursive
 * font (no Rive, no stroke-draw), which reads like a pen moving across.
 *
 * Plays once per session (sessionStorage) and is skipped entirely under
 * prefers-reduced-motion.
 */
export default function SignatureIntro() {
  const reduce = useReducedMotion();
  const [done, setDone] = useState(() => {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return true;
    return !!sessionStorage.getItem('sig-intro');
  });

  useEffect(() => {
    if (done) return;
    if (reduce) { setDone(true); return; }
    sessionStorage.setItem('sig-intro', '1');
    const t = setTimeout(() => setDone(true), 2600);
    return () => clearTimeout(t);
  }, [done, reduce]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="sig-intro"
          className="fixed inset-0 z-[100] bg-[#282c20] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ y: '-100%' }}
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
        >
          <motion.span
            className="font-signature select-none leading-none"
            style={{
              color: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))',
              fontSize: 'clamp(76px, 16vw, 230px)',
            }}
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0% 0 0)' }}
            transition={{ duration: 1.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            Ryan Xu
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
