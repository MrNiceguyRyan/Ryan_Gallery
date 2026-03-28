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
    const t1 = setTimeout(() => setPhase('reveal'), 1200);
    const t2 = setTimeout(() => setPhase('exit'), 3200);
    const t3 = setTimeout(onComplete, 4000);
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

          {/* ── Radial background pulse — soft warm glow ── */}
          <motion.div
            className="absolute rounded-full"
            style={{
              left: '50%',
              top: '50%',
              translateX: '-50%',
              translateY: '-50%',
              background: 'radial-gradient(circle, rgba(200,180,160,0.08) 0%, transparent 70%)',
            }}
            initial={{ width: 0, height: 0, opacity: 0 }}
            animate={{ width: 800, height: 800, opacity: 1 }}
            transition={{ duration: 3, ease: [0.25, 0, 0.2, 1] }}
          />

          {/* ── Golden spiral particles — 24 dots ── */}
          {[...Array(24)].map((_, i) => {
            const golden = 2.39996323;
            const angle = i * golden;
            const r = 50 + Math.sqrt(i) * 50;
            const size = i % 5 === 0 ? 5 : i % 3 === 0 ? 3.5 : 2;
            return (
              <motion.div
                key={`p-${i}`}
                className="absolute rounded-full"
                style={{
                  width: size,
                  height: size,
                  left: '50%',
                  top: '50%',
                  background:
                    i % 7 === 0
                      ? 'rgba(180,140,100,0.3)'
                      : i % 5 === 0
                        ? 'rgba(120,120,120,0.2)'
                        : 'rgba(30,30,30,0.12)',
                }}
                initial={{
                  x: 0,
                  y: 0,
                  opacity: 0,
                  scale: 0,
                }}
                animate={{
                  x: Math.cos(angle) * r,
                  y: Math.sin(angle) * r,
                  opacity: [0, 0.5, 0],
                  scale: [0, 1.5, 0],
                }}
                transition={{
                  duration: 2.5 + (i % 4) * 0.4,
                  delay: 0.1 + i * 0.06,
                  ease: 'easeOut',
                }}
              />
            );
          })}

          {/* ── Orbiting dots — 3 slow-spinning circles ── */}
          {[0, 1, 2].map((ring) => {
            const radius = 100 + ring * 60;
            const dotCount = 3 + ring;
            return [...Array(dotCount)].map((_, d) => {
              const startAngle = (d / dotCount) * Math.PI * 2 + ring * 0.5;
              return (
                <motion.div
                  key={`orbit-${ring}-${d}`}
                  className="absolute rounded-full bg-gray-900/8"
                  style={{
                    width: 3 - ring * 0.5,
                    height: 3 - ring * 0.5,
                    left: '50%',
                    top: '50%',
                  }}
                  initial={{
                    x: Math.cos(startAngle) * radius * 0.5,
                    y: Math.sin(startAngle) * radius * 0.5,
                    opacity: 0,
                  }}
                  animate={{
                    x: [
                      Math.cos(startAngle) * radius,
                      Math.cos(startAngle + 0.8) * radius,
                    ],
                    y: [
                      Math.sin(startAngle) * radius,
                      Math.sin(startAngle + 0.8) * radius,
                    ],
                    opacity: [0, 0.25, 0.1],
                  }}
                  transition={{
                    duration: 3.5,
                    delay: 0.3 + ring * 0.3,
                    ease: 'easeInOut',
                  }}
                />
              );
            });
          })}

          {/* ── Concentric rings — 3 breathing circles ── */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`ring-${i}`}
              className="absolute rounded-full"
              style={{
                left: '50%',
                top: '50%',
                translateX: '-50%',
                translateY: '-50%',
                border: `1px solid rgba(0,0,0,${0.04 - i * 0.01})`,
              }}
              initial={{
                width: i === 0 ? 400 : i === 1 ? 0 : 0,
                height: i === 0 ? 400 : i === 1 ? 0 : 0,
                opacity: 0,
              }}
              animate={{
                width: i === 0 ? 260 : i === 1 ? 180 : 320,
                height: i === 0 ? 260 : i === 1 ? 180 : 320,
                opacity: [0, 0.6, 0.2],
              }}
              transition={{
                duration: 2.5 + i * 0.3,
                delay: i * 0.25,
                ease: [0.25, 0, 0.2, 1],
              }}
            />
          ))}

          {/* ── Shutter aperture blades — 6 rotated ellipses ── */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={`blade-${i}`}
              className="absolute rounded-full"
              style={{
                left: '50%',
                top: '50%',
                translateX: '-50%',
                translateY: '-50%',
                width: 140,
                height: 40,
                border: '1px solid rgba(0,0,0,0.03)',
                rotate: `${i * 30}deg`,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: [0, 0.5, 0.15] }}
              transition={{
                duration: 2,
                delay: 0.2 + i * 0.08,
                ease: [0.25, 0, 0.2, 1],
              }}
            />
          ))}

          {/* ══════ TEXT BLOCK ══════ */}
          <div className="relative flex flex-col items-center z-10">
            {/* Name — staggered letter reveal with blur */}
            <div className="overflow-hidden">
              <div className="flex items-center justify-center gap-[3px]">
                {name.split('').map((letter, i) => (
                  <motion.span
                    key={i}
                    className="text-[clamp(2.5rem,8vw,4.5rem)] font-[200] tracking-[0.3em] text-gray-900 inline-block"
                    initial={{ opacity: 0, y: 50, filter: 'blur(12px)', scale: 0.8 }}
                    animate={
                      phase === 'reveal' || phase === 'exit'
                        ? { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }
                        : {}
                    }
                    transition={{
                      duration: 1,
                      delay: i * 0.12,
                      ease: expo,
                    }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </div>
            </div>

            {/* Subtitle — fades up with blur */}
            <motion.p
              className="text-[10px] md:text-[11px] tracking-[0.55em] text-gray-400 font-light mt-6"
              initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
              animate={
                phase === 'reveal' || phase === 'exit'
                  ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                  : {}
              }
              transition={{ duration: 0.8, delay: 0.5, ease: expo }}
            >
              VISUAL ARCHIVE
            </motion.p>

            {/* Dot trio — photography aperture motif */}
            <motion.div
              className="flex items-center gap-3 mt-6"
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
                  className="rounded-full"
                  style={{
                    width: d === 1 ? 6 : 3,
                    height: d === 1 ? 6 : 3,
                    background:
                      d === 1
                        ? 'rgba(180,140,100,0.4)'
                        : 'rgba(30,30,30,0.12)',
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase === 'reveal' || phase === 'exit'
                      ? { scale: 1, opacity: 1 }
                      : {}
                  }
                  transition={{
                    duration: 0.5,
                    delay: 0.75 + d * 0.1,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
