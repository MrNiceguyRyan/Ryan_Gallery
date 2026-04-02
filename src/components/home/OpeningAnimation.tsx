import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface Props {
  onComplete: () => void;
}

const expo = [0.16, 1, 0.3, 1] as const;

export default function OpeningAnimation({ onComplete }: Props) {
  const [phase, setPhase] = useState<'build' | 'reveal' | 'exit'>('build');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reveal'), 600);
    const t2 = setTimeout(() => setPhase('exit'), 2000);
    const t3 = setTimeout(onComplete, 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const name = 'RYAN';

  return (
    <AnimatePresence>
      {phase !== 'exit' && (
        <motion.div
          className="fixed inset-0 z-50 bg-[#0A0A0A] flex items-center justify-center overflow-hidden"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Concentric rings */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`ring-${i}`}
              className="absolute rounded-full"
              style={{
                left: '50%',
                top: '50%',
                translateX: '-50%',
                translateY: '-50%',
                border: `1px solid rgba(255,255,255,${0.06 - i * 0.015})`,
              }}
              initial={{ width: 0, height: 0, opacity: 0 }}
              animate={{
                width: i === 0 ? 260 : i === 1 ? 180 : 320,
                height: i === 0 ? 260 : i === 1 ? 180 : 320,
                opacity: [0, 0.5, 0.15],
              }}
              transition={{
                duration: 1.8 + i * 0.2,
                delay: i * 0.15,
                ease: [0.25, 0, 0.2, 1],
              }}
            />
          ))}

          {/* Shutter blades */}
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
                border: '1px solid rgba(255,255,255,0.04)',
                rotate: `${i * 30}deg`,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: [0, 0.4, 0.1] }}
              transition={{
                duration: 1.4,
                delay: 0.1 + i * 0.05,
                ease: [0.25, 0, 0.2, 1],
              }}
            />
          ))}

          {/* Text */}
          <div className="relative flex flex-col items-center z-10">
            <div className="overflow-hidden">
              <div className="flex items-center justify-center gap-[3px]">
                {name.split('').map((letter, i) => (
                  <motion.span
                    key={i}
                    className="text-[clamp(2.5rem,8vw,4.5rem)] font-[200] tracking-[0.3em] text-white inline-block"
                    initial={{ opacity: 0, y: 50, filter: 'blur(12px)', scale: 0.8 }}
                    animate={
                      phase === 'reveal'
                        ? { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }
                        : {}
                    }
                    transition={{
                      duration: 0.7,
                      delay: i * 0.08,
                      ease: expo,
                    }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </div>
            </div>

            <motion.p
              className="text-[10px] md:text-[11px] tracking-[0.55em] text-white/40 font-light mt-6"
              initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
              animate={
                phase === 'reveal'
                  ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                  : {}
              }
              transition={{ duration: 0.6, delay: 0.3, ease: expo }}
            >
              VISUAL ARCHIVE
            </motion.p>

            <motion.div
              className="flex items-center gap-3 mt-6"
              initial={{ opacity: 0 }}
              animate={phase === 'reveal' ? { opacity: 1 } : {}}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              {[0, 1, 2].map((d) => (
                <motion.div
                  key={d}
                  className="rounded-full"
                  style={{
                    width: d === 1 ? 6 : 3,
                    height: d === 1 ? 6 : 3,
                    background:
                      d === 1 ? 'rgba(156,194,169,0.5)' : 'rgba(255,255,255,0.15)',
                  }}
                  initial={{ scale: 0 }}
                  animate={phase === 'reveal' ? { scale: 1 } : {}}
                  transition={{ duration: 0.3, delay: 0.55 + d * 0.08 }}
                />
              ))}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
