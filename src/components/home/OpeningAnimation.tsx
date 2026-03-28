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
    const t1 = setTimeout(() => setPhase('reveal'), 1400);
    const t2 = setTimeout(() => setPhase('exit'), 3400);
    const t3 = setTimeout(onComplete, 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const name = 'RYAN';

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
            className="absolute inset-0 opacity-[0.02] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            }}
          />

          {/* ── Radial particles — scattered in golden spiral ── */}
          {[...Array(16)].map((_, i) => {
            const golden = 2.39996323; // golden angle in radians
            const angle = i * golden;
            const r = 60 + Math.sqrt(i) * 55;
            return (
              <motion.div
                key={`p-${i}`}
                className="absolute rounded-full"
                style={{
                  width: i % 4 === 0 ? 4 : i % 3 === 0 ? 3 : 2,
                  height: i % 4 === 0 ? 4 : i % 3 === 0 ? 3 : 2,
                  left: '50%',
                  top: '50%',
                  background: i % 5 === 0 ? 'rgba(120,120,120,0.25)' : 'rgba(30,30,30,0.15)',
                }}
                initial={{
                  x: Math.cos(angle) * r * 0.2,
                  y: Math.sin(angle) * r * 0.2,
                  opacity: 0,
                  scale: 0,
                }}
                animate={{
                  x: Math.cos(angle) * r,
                  y: Math.sin(angle) * r,
                  opacity: [0, 0.4, 0],
                  scale: [0, 1.2, 0],
                }}
                transition={{
                  duration: 2.2 + (i % 5) * 0.3,
                  delay: 0.15 + i * 0.08,
                  ease: 'easeOut',
                }}
              />
            );
          })}

          {/* ── Outer ring — breathes in ── */}
          <motion.div
            className="absolute rounded-full border border-gray-200/40"
            style={{ left: '50%', top: '50%', translateX: '-50%', translateY: '-50%' }}
            initial={{ width: 500, height: 500, opacity: 0 }}
            animate={{ width: 320, height: 320, opacity: [0, 0.4, 0.2] }}
            transition={{ duration: 2.5, ease: [0.25, 0, 0.2, 1] }}
          />

          {/* ── Inner ring — expands out ── */}
          <motion.div
            className="absolute rounded-full border border-gray-300/20"
            style={{ left: '50%', top: '50%', translateX: '-50%', translateY: '-50%' }}
            initial={{ width: 0, height: 0, opacity: 0 }}
            animate={{ width: 200, height: 200, opacity: [0, 0.5, 0.15] }}
            transition={{ duration: 2, delay: 0.3, ease: 'easeOut' }}
          />

          {/* ── Four delicate corner brackets ── */}
          {[
            { top: 'calc(50% - 60px)', left: 'calc(50% - 90px)', r: 0 },
            { top: 'calc(50% - 60px)', left: 'calc(50% + 74px)', r: 90 },
            { top: 'calc(50% + 44px)', left: 'calc(50% + 74px)', r: 180 },
            { top: 'calc(50% + 44px)', left: 'calc(50% - 90px)', r: 270 },
          ].map((pos, i) => (
            <motion.div
              key={`corner-${i}`}
              className="absolute"
              style={{ top: pos.top, left: pos.left, rotate: `${pos.r}deg` }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.12, scale: 1 }}
              transition={{ delay: 0.6 + i * 0.12, duration: 0.8, ease: expo }}
            >
              <div className="w-4 h-px bg-gray-900" />
              <div className="w-px h-4 bg-gray-900" />
            </motion.div>
          ))}

          {/* ── Horizontal accent lines — left & right ── */}
          <motion.div
            className="absolute h-px bg-gradient-to-l from-gray-300/40 to-transparent"
            style={{ top: '50%', right: 'calc(50% + 100px)' }}
            initial={{ width: 0 }}
            animate={{ width: 60 }}
            transition={{ duration: 1, delay: 0.8, ease: expo }}
          />
          <motion.div
            className="absolute h-px bg-gradient-to-r from-gray-300/40 to-transparent"
            style={{ top: '50%', left: 'calc(50% + 100px)' }}
            initial={{ width: 0 }}
            animate={{ width: 60 }}
            transition={{ duration: 1, delay: 0.8, ease: expo }}
          />

          {/* ══════ TEXT BLOCK ══════ */}
          <div className="relative flex flex-col items-center z-10">
            {/* Name — staggered letter reveal with spring */}
            <div className="overflow-hidden">
              <div className="flex items-center justify-center gap-[2px]">
                {name.split('').map((letter, i) => (
                  <motion.span
                    key={i}
                    className="text-[clamp(2.5rem,8vw,4.5rem)] font-[200] tracking-[0.3em] text-gray-900 inline-block"
                    initial={{ opacity: 0, y: 60, filter: 'blur(8px)' }}
                    animate={
                      phase === 'reveal' || phase === 'exit'
                        ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                        : {}
                    }
                    transition={{
                      duration: 0.9,
                      delay: i * 0.1,
                      ease: expo,
                    }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </div>
            </div>

            {/* Elegant divider — gradient line */}
            <motion.div
              className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mt-5"
              initial={{ width: 0, opacity: 0 }}
              animate={
                phase === 'reveal' || phase === 'exit'
                  ? { width: 140, opacity: 1 }
                  : {}
              }
              transition={{ duration: 0.8, delay: 0.3, ease: expo }}
            />

            {/* Subtitle */}
            <motion.p
              className="text-[10px] md:text-[11px] tracking-[0.5em] text-gray-400 font-light mt-4"
              initial={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
              animate={
                phase === 'reveal' || phase === 'exit'
                  ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                  : {}
              }
              transition={{ duration: 0.7, delay: 0.5, ease: expo }}
            >
              VISUAL ARCHIVE
            </motion.p>

            {/* Dot trio */}
            <motion.div
              className="flex items-center gap-2.5 mt-5"
              initial={{ opacity: 0 }}
              animate={
                phase === 'reveal' || phase === 'exit'
                  ? { opacity: 1 }
                  : {}
              }
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              {[0, 1, 2].map((d) => (
                <motion.div
                  key={d}
                  className="rounded-full bg-gray-900"
                  style={{ width: d === 1 ? 5 : 3, height: d === 1 ? 5 : 3 }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase === 'reveal' || phase === 'exit'
                      ? { scale: 1, opacity: d === 1 ? 0.35 : 0.15 }
                      : {}
                  }
                  transition={{ duration: 0.5, delay: 0.7 + d * 0.08, ease: 'easeOut' }}
                />
              ))}
            </motion.div>
          </div>

          {/* ── Bottom progress — elegant gradient bar ── */}
          <motion.div
            className="absolute bottom-0 left-0 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.15) 70%, transparent 100%)',
            }}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 3.2, ease: [0.08, 0.6, 0.3, 1] }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
