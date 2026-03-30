import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { useRef } from 'react';

const expo = [0.16, 1, 0.3, 1] as const;

interface Props {
  imageUrl: string;
  /** Title line 1 */
  title: string;
  /** Optional second line */
  titleLine2?: string;
  /** Small label above title */
  label?: string;
  /** Meta tags below title (e.g. ["New York, NY", "Nikon Zf"]) */
  meta?: string[];
  /** Height class: defaults to h-[70vh] md:h-[85vh] */
  heightClass?: string;
  /** Image object-position: defaults to "center" */
  objectPosition?: string;
}

export default function ParallaxHero({
  imageUrl,
  title,
  titleLine2,
  label,
  meta = [],
  heightClass = 'h-[70vh] md:h-[85vh]',
  objectPosition = 'center',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  const imgY = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const smoothImgY = useSpring(imgY, { stiffness: 80, damping: 30 });
  const smoothTextY = useSpring(textY, { stiffness: 80, damping: 30 });

  return (
    <section ref={ref} className={`relative ${heightClass} overflow-hidden bg-gray-100`}>
      {/* Ken Burns parallax image — bright */}
      <motion.div
        className="absolute inset-0"
        style={{ y: smoothImgY }}
      >
        <motion.img
          src={imageUrl}
          alt={title}
          className="w-full h-[120%] object-cover"
          style={{ objectPosition }}
          initial={{ scale: 1.15, filter: 'brightness(0.7) blur(4px)' }}
          animate={{ scale: 1, filter: 'brightness(1.05) blur(0px)' }}
          transition={{ duration: 5, ease: [0.25, 0, 0.2, 1] }}
        />
        {/* Light gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-transparent" />
      </motion.div>

      {/* Text overlay — bottom-left */}
      <motion.div
        className="absolute bottom-12 md:bottom-20 left-6 md:left-16 z-10 max-w-2xl"
        style={{ y: smoothTextY, opacity }}
      >
        {label && (
          <motion.p
            className="text-[10px] md:text-xs tracking-[0.4em] text-gray-600 uppercase font-light mb-4 drop-shadow-sm"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: expo }}
          >
            {label}
          </motion.p>
        )}
        <motion.h1
          className="text-4xl md:text-6xl lg:text-8xl font-[100] text-gray-900 tracking-tight leading-[0.95]"
          initial={{ opacity: 0, y: 60, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1.2, delay: 0.2, ease: expo }}
        >
          {title}
          {titleLine2 && <><br />{titleLine2}</>}
        </motion.h1>
        {meta.length > 0 && (
          <motion.div
            className="flex items-center gap-4 md:gap-6 mt-5 flex-wrap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7, ease: expo }}
          >
            {meta.map((item, i) => (
              <span key={i} className="flex items-center gap-4 md:gap-6">
                {i > 0 && (
                  <motion.span
                    className="h-px bg-gray-400"
                    initial={{ width: 0 }}
                    animate={{ width: 20 }}
                    transition={{ duration: 0.6, delay: 0.9 + i * 0.1, ease: expo }}
                  />
                )}
                <span className="text-xs text-gray-500 font-mono tracking-wider">{item}</span>
              </span>
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-6 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.6 }}
      >
        <motion.div
          className="w-px h-7 bg-gray-500/50 origin-top"
          animate={{ scaleY: [0, 1, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </section>
  );
}
