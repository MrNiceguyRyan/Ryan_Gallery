import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface Props {
  onComplete: () => void;
}

const expo = [0.16, 1, 0.3, 1] as const;
const smooth = [0.25, 0.1, 0.25, 1] as const;

export default function OpeningAnimation({ onComplete }: Props) {
  const [phase, setPhase] = useState<'build' | 'reveal' | 'exit'>('build');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reveal'), 1600);
    const t2 = setTimeout(() => setPhase('exit'), 3600);
    const t3 = setTimeout(onComplete, 4400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const name = 'RYAN';
  const subtitle = 'VISUAL ARCHIVE';

  return (
    <AnimatePresence>
      {phase !== 'exit' && (
        <motion.div
          className="fixed inset-0 z-50 bg-white flex items-center justify-center overflow-hidden"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: smooth }}
        >
          {/* ── Grain texture ── */}
          <div
            className="absolute inset-0 opacity-[0.025] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            }}
          />

          {/* ── Floating particles (scattered across viewport) ── */}
          {[...Array(12)].map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const radius = 120 + (i % 3) * 60;
            return (
              <motion.div
                key={`p-${i}`}
                className="absolute rounded-full bg-gray-900"
                style={{
                  width: i % 3 === 0 ? 3 : 2,
                  height: i % 3 === 0 ? 3 : 2,
                  left: '50%',
                  top: '50%',
                }}
                initial={{
                  x: Math.cos(angle) * (radius * 0.3),
                  y: Math.sin(angle) * (radius * 0.3),
                  opacity: 0,
                  scale: 0,
                }}
                animate={{
                  x: Math.cos(angle) * radius,
                  y: Math.sin(angle) * radius,
                  opacity: [0, 0.25, 0],
                  scale: [0, 1, 0],
                }}
                transition={{
                  duration: 2.5 + (i % 4) * 0.3,
                  delay: 0.2 + i * 0.1,
                  ease: 'easeOut',
                }}
              />
            );
          })}

          {/* ── Orbiting ring 1 — slow, large ── */}
          <motion.div
            className="absolute rounded-full border border-gray-900/[0.06]"
            style={{ left: '50%', top: '50%', translateX: '-50%', translateY: '-50%' }}
            initial={{ width: 0, height: 0, opacity: 0, rotate: 0 }}
            animate={{ width: 280, height: 280, opacity: [0, 1, 0.5], rotate: 90 }}
            transition={{ duration: 3.5, ease: 'easeOut' }}
          />

          {/* ── Orbiting ring 2 — medium ── */}
          <motion.div
            className="absolute rounded-full border border-gray-900/[0.04]"
            style={{ left: '50%', top: '50%', translateX: '-50%', translateY: '-50%' }}
            initial={{ width: 0, height: 0, opacity: 0, rotate: 0 }}
            animate={{ width: 400, height: 400, opacity: [0, 0.6, 0.3], rotate: -60 }}
            transition={{ duration: 3.5, delay: 0.3, ease: 'easeOut' }}
          />

          {/* ── Crosshair — top portion (above text) ── */}
          <motion.div
            className="absolute w-px bg-gray-900/60"
            style={{ left: '50%', translateX: '-50%' }}
            initial={{ height: 0, top: '50%', translateY: '-100%' }}
            animate={{ height: 80, top: 'calc(50% - 50px)', translateY: '-100%' }}
            transition={{ duration: 1.2, ease: expo }}
          />

          {/* ── Crosshair — bottom portion (below text) ── */}
          <motion.div
            className="absolute w-px bg-gray-900/60"
            style={{ left: '50%', translateX: '-50%' }}
            initial={{ height: 0, bottom: '50%', translateY: '100%' }}
            animate={{ height: 80, bottom: 'calc(50% - 50px)', translateY: '100%' }}
            transition={{ duration: 1.2, ease: expo }}
          />

          {/* ── Horizontal accent — left ── */}
          <motion.div
            className="absolute h-px bg-gray-900/20"
            style={{ top: '50%', translateY: '-50%' }}
            initial={{ width: 0, right: 'calc(50% + 110px)' }}
            animate={{ width: 50 }}
            transition={{ duration: 0.8, delay: 0.7, ease: expo }}
          />

          {/* ── Horizontal accent — right ── */}
          <motion.div
            className="absolute h-px bg-gray-900/20"
            style={{ top: '50%', translateY: '-50%' }}
            initial={{ width: 0, left: 'calc(50% + 110px)' }}
            animate={{ width: 50 }}
            transition={{ duration: 0.8, delay: 0.7, ease: expo }}
          />

          {/* ── Corner brackets — TL ── */}
          <motion.div
            className="absolute"
            style={{ top: 'calc(50% - 70px)', left: 'calc(50% - 100px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            transition={{ delay: 0.9, duration: 0.6 }}
          >
            <div className="w-5 h-px bg-gray-900" />
            <div className="w-px h-5 bg-gray-900" />
          </motion.div>

          {/* ── Corner brackets — TR ── */}
          <motion.div
            className="absolute"
            style={{ top: 'calc(50% - 70px)', right: 'calc(50% - 100px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            transition={{ delay: 1.0, duration: 0.6 }}
          >
            <div className="flex flex-col items-end">
              <div className="w-5 h-px bg-gray-900" />
              <div className="w-px h-5 bg-gray-900 self-end" />
            </div>
          </motion.div>

          {/* ── Corner brackets — BL ── */}
          <motion.div
            className="absolute"
            style={{ bottom: 'calc(50% - 70px)', left: 'calc(50% - 100px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            transition={{ delay: 1.1, duration: 0.6 }}
          >
            <div className="flex flex-col">
              <div className="w-px h-5 bg-gray-900" />
              <div className="w-5 h-px bg-gray-900" />
            </div>
          </motion.div>

          {/* ── Corner brackets — BR ── */}
          <motion.div
            className="absolute"
            style={{ bottom: 'calc(50% - 70px)', right: 'calc(50% - 100px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            transition={{ delay: 1.2, duration: 0.6 }}
          >
            <div className="flex flex-col items-end">
              <div className="w-px h-5 bg-gray-900 self-end" />
              <div className="w-5 h-px bg-gray-900" />
            </div>
          </motion.div>

          {/* ── Center dot ── */}
          <motion.div
            className="absolute w-1.5 h-1.5 rounded-full bg-gray-900"
            style={{ left: '50%', top: '50%', translateX: '-50%', translateY: '-50%' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2, 0], opacity: [0, 0.5, 0] }}
            transition={{ duration: 1.4, delay: 0.3, ease: 'easeOut' }}
          />

          {/* ══════ TEXT BLOCK — centered, clear space ══════ */}
          <div className="relative flex flex-col items-center z-10">
            {/* Main name — staggered letter reveal */}
            <div className="overflow-hidden">
              <div className="flex items-center justify-center">
                {name.split('').map((letter, i) => (
                  <motion.span
                    key={i}
                    className="text-4xl md:text-6xl font-extralight tracking-[0.35em] text-gray-900 inline-block"
                    style={{ perspective: 400 }}
                    initial={{ opacity: 0, y: 50, rotateX: 80 }}
                    animate={
                      phase === 'reveal' || phase === 'exit'
                        ? { opacity: 1, y: 0, rotateX: 0 }
                        : {}
                    }
                    transition={{
                      duration: 0.8,
                      delay: i * 0.1,
                      ease: expo,
                    }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </div>
            </div>

            {/* Divider line between name & subtitle */}
            <motion.div
              className="h-px bg-gray-900/15 mt-5"
              initial={{ width: 0 }}
              animate={
                phase === 'reveal' || phase === 'exit'
                  ? { width: 120 }
                  : {}
              }
              transition={{ duration: 0.8, delay: 0.35, ease: expo }}
            />

            {/* Subtitle — "VISUAL ARCHIVE" */}
            <motion.div
              className="mt-4 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={
                phase === 'reveal' || phase === 'exit'
                  ? { opacity: 1 }
                  : {}
              }
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <motion.p
                className="text-[10px] md:text-xs tracking-[0.45em] text-gray-400 font-light"
                initial={{ y: 20, letterSpacing: '0.8em' }}
                animate={
                  phase === 'reveal' || phase === 'exit'
                    ? { y: 0, letterSpacing: '0.45em' }
                    : {}
                }
                transition={{ duration: 0.8, delay: 0.5, ease: expo }}
              >
                {subtitle}
              </motion.p>
            </motion.div>

            {/* Minimal dot accents flanking the text */}
            <motion.div
              className="flex items-center gap-3 mt-5"
              initial={{ opacity: 0 }}
              animate={
                phase === 'reveal' || phase === 'exit'
                  ? { opacity: 0.3 }
                  : {}
              }
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              <div className="w-1 h-1 rounded-full bg-gray-900" />
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              <div className="w-1 h-1 rounded-full bg-gray-900" />
            </motion.div>
          </div>

          {/* ── Bottom loading bar ── */}
          <motion.div
            className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-gray-900/0 via-gray-900/30 to-gray-900/0"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 3.4, ease: [0.08, 0.6, 0.3, 1] }}
          />

          {/* ── Scan line effect — subtle horizontal sweep ── */}
          <motion.div
            className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-900/10 to-transparent"
            initial={{ top: '30%' }}
            animate={{ top: '70%' }}
            transition={{ duration: 2.8, delay: 0.4, ease: 'easeInOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
