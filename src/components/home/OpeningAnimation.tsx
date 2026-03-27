import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface Props {
  onComplete: () => void;
}

// Easing curves
const smooth = [0.25, 0.1, 0.25, 1] as const;
const expo = [0.16, 1, 0.3, 1] as const;

export default function OpeningAnimation({ onComplete }: Props) {
  const [phase, setPhase] = useState<'intro' | 'reveal' | 'done'>('intro');

  useEffect(() => {
    // Phase 1: Intro lines + particles (0 -> 1.8s)
    // Phase 2: Text reveal (1.8s -> 3.6s)
    // Phase 3: Done / fade out (3.6s -> 4.4s)
    const revealTimer = setTimeout(() => setPhase('reveal'), 1800);
    const doneTimer = setTimeout(() => setPhase('done'), 3800);
    const completeTimer = setTimeout(() => onComplete(), 4600);

    return () => {
      clearTimeout(revealTimer);
      clearTimeout(doneTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  // Letters for staggered animation
  const nameLetters = 'Ryan'.split('');

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          className="fixed inset-0 z-50 bg-white flex items-center justify-center overflow-hidden"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: smooth }}
        >
          {/* Background grain texture */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
            }}
          />

          {/* Floating particles */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={`particle-${i}`}
              className="absolute w-px h-px bg-gray-900 rounded-full"
              initial={{
                x: (i % 2 === 0 ? -1 : 1) * (80 + i * 40),
                y: (i % 3 === 0 ? -1 : 1) * (60 + i * 30),
                opacity: 0,
                scale: 0,
              }}
              animate={{
                x: (i % 2 === 0 ? 1 : -1) * (40 + i * 20),
                y: (i % 3 === 0 ? 1 : -1) * (30 + i * 15),
                opacity: [0, 0.3, 0],
                scale: [0, 1.5, 0],
              }}
              transition={{
                duration: 3 + i * 0.5,
                delay: 0.3 + i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}

          <div className="relative flex flex-col items-center">
            {/* ── Crosshair lines ── */}
            {/* Vertical line - grows from center */}
            <motion.div
              className="absolute w-px bg-gray-900/80 left-1/2 -translate-x-1/2"
              initial={{ height: 0, top: '50%', translateY: '-50%' }}
              animate={{ height: 120 }}
              transition={{ duration: 1.4, ease: expo }}
              style={{ top: 'calc(50% - 80px)' }}
            />

            {/* Horizontal line - grows from center */}
            <motion.div
              className="absolute h-px bg-gray-900/30 top-1/2 -translate-y-1/2"
              initial={{ width: 0 }}
              animate={{ width: 60 }}
              transition={{ duration: 1.0, delay: 0.6, ease: expo }}
              style={{ top: 'calc(50% + 0px)', left: 'calc(50% - 30px)' }}
            />

            {/* Corner marks - top left */}
            <motion.div
              className="absolute"
              style={{ top: 'calc(50% - 100px)', left: 'calc(50% - 80px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.15 }}
              transition={{ delay: 0.8, duration: 0.6 }}
            >
              <div className="w-4 h-px bg-gray-900" />
              <div className="w-px h-4 bg-gray-900" />
            </motion.div>

            {/* Corner marks - bottom right */}
            <motion.div
              className="absolute"
              style={{ top: 'calc(50% + 96px)', left: 'calc(50% + 64px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.15 }}
              transition={{ delay: 0.9, duration: 0.6 }}
            >
              <div className="flex flex-col items-end">
                <div className="w-4 h-px bg-gray-900" />
                <div className="w-px h-4 bg-gray-900 self-end" />
              </div>
            </motion.div>

            {/* ── Circular ring pulse ── */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 rounded-full border border-gray-900/10"
              style={{ top: 'calc(50% - 40px)' }}
              initial={{ width: 0, height: 0, opacity: 0 }}
              animate={{ width: 80, height: 80, opacity: [0, 0.3, 0] }}
              transition={{ delay: 0.4, duration: 2, ease: 'easeOut' }}
            />

            {/* ── Main content: centered vertically ── */}
            <div className="flex flex-col items-center" style={{ marginTop: 80 }}>
              {/* Name - staggered letter reveal */}
              <div className="overflow-hidden">
                <motion.div
                  className="flex"
                  initial={{ y: 60 }}
                  animate={phase === 'reveal' ? { y: 0 } : {}}
                  transition={{ duration: 0.9, ease: expo }}
                >
                  {nameLetters.map((letter, i) => (
                    <motion.span
                      key={i}
                      className="text-4xl md:text-6xl font-extralight tracking-[0.3em] text-gray-900 uppercase inline-block"
                      initial={{ opacity: 0, y: 40, rotateX: 90 }}
                      animate={
                        phase === 'reveal'
                          ? { opacity: 1, y: 0, rotateX: 0 }
                          : {}
                      }
                      transition={{
                        duration: 0.7,
                        delay: i * 0.08,
                        ease: expo,
                      }}
                      style={{ display: 'inline-block', paddingRight: i === nameLetters.length - 1 ? 0 : undefined }}
                    >
                      {letter}
                    </motion.span>
                  ))}
                </motion.div>
              </div>

              {/* Subtitle with line decoration */}
              <motion.div
                className="flex items-center gap-4 mt-5"
                initial={{ opacity: 0 }}
                animate={phase === 'reveal' ? { opacity: 1 } : {}}
                transition={{ duration: 0.8, delay: 0.4, ease: smooth }}
              >
                <motion.div
                  className="h-px bg-gray-300"
                  initial={{ width: 0 }}
                  animate={phase === 'reveal' ? { width: 32 } : {}}
                  transition={{ duration: 0.6, delay: 0.5, ease: expo }}
                />
                <motion.p
                  className="text-[11px] tracking-[0.5em] text-gray-400 uppercase font-light"
                  initial={{ opacity: 0, letterSpacing: '0.8em' }}
                  animate={
                    phase === 'reveal'
                      ? { opacity: 1, letterSpacing: '0.5em' }
                      : {}
                  }
                  transition={{ duration: 0.8, delay: 0.5, ease: smooth }}
                >
                  Visual Archive
                </motion.p>
                <motion.div
                  className="h-px bg-gray-300"
                  initial={{ width: 0 }}
                  animate={phase === 'reveal' ? { width: 32 } : {}}
                  transition={{ duration: 0.6, delay: 0.5, ease: expo }}
                />
              </motion.div>

              {/* Year tag */}
              <motion.p
                className="text-[9px] font-mono text-gray-300 tracking-[0.3em] mt-4"
                initial={{ opacity: 0, y: 10 }}
                animate={phase === 'reveal' ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.7, ease: smooth }}
              >
                EST. 2024
              </motion.p>
            </div>
          </div>

          {/* Bottom loading bar */}
          <motion.div
            className="absolute bottom-0 left-0 h-px bg-gray-900/20"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 3.6, ease: [0.1, 0, 0.2, 1] }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
