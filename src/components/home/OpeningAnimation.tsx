import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface Props {
  onComplete: () => void;
}

export default function OpeningAnimation({ onComplete }: Props) {
  const [phase, setPhase] = useState<'line' | 'text' | 'done'>('line');

  useEffect(() => {
    // Line grows for 1.5s, then text reveals
    const lineTimer = setTimeout(() => setPhase('text'), 1600);
    // Text stays for 2s, then fade out
    const doneTimer = setTimeout(() => setPhase('done'), 3800);
    // After fade out animation, notify parent
    const completeTimer = setTimeout(() => onComplete(), 4600);

    return () => {
      clearTimeout(lineTimer);
      clearTimeout(doneTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          className="fixed inset-0 z-50 bg-white flex items-center justify-center"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="relative flex flex-col items-center">
            {/* Vertical line */}
            <motion.div
              className="w-px bg-gray-900 origin-top"
              initial={{ scaleY: 0, height: 120 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 1.5, ease: [0.25, 0.1, 0.25, 1] }}
            />

            {/* Text reveal */}
            <motion.div
              className="mt-8 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={phase === 'text' ? { opacity: 1 } : {}}
              transition={{ duration: 0.6 }}
            >
              <motion.h1
                className="text-4xl md:text-6xl font-extralight tracking-[0.3em] text-gray-900 uppercase pl-[0.3em]"
                initial={{ y: 40 }}
                animate={phase === 'text' ? { y: 0 } : {}}
                transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
              >
                Ryan
              </motion.h1>
            </motion.div>

            <motion.div
              className="mt-3 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={phase === 'text' ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <motion.p
                className="text-xs tracking-[0.5em] text-gray-400 uppercase font-light"
                initial={{ y: 20 }}
                animate={phase === 'text' ? { y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              >
                Visual Archive
              </motion.p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
