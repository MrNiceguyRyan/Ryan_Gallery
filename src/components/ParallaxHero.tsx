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
  /** Gradient direction from bottom: default white */
  gradientFrom?: string;
}

export default function ParallaxHero({
  imageUrl,
  title,
  titleLine2,
  label,
  meta = [],
  heightClass = 'h-[70vh] md:h-[85vh]',
  objectPosition = 'center',
  gradientFrom = 'from-white',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  const imgY = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1, 1.06]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const smoothImgY = useSpring(imgY, { stiffness: 80, damping: 30 });
  const smoothTextY = useSpring(textY, { stiffness: 80, damping: 30 });

  return (
    <section ref={ref} className={`relative ${heightClass} overflow-hidden`}>
      {/* Parallax image */}
      <motion.div
        className="absolute inset-0"
        style={{ y: smoothImgY, scale: imgScale }}
      >
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover"
          style={{ objectPosition }}
        />
        {/* Gradient overlays */}
        <div className={`absolute inset-0 bg-gradient-to-t ${gradientFrom} via-white/20 to-transparent`} />
        <div className="absolute inset-0 bg-gradient-to-r from-white/50 via-transparent to-transparent" />
      </motion.div>

      {/* Text overlay — bottom-left */}
      <motion.div
        className="absolute bottom-12 md:bottom-20 left-6 md:left-16 z-10 max-w-2xl"
        style={{ y: smoothTextY, opacity }}
      >
        {label && (
          <motion.p
            className="text-[10px] md:text-xs tracking-[0.4em] text-gray-500 uppercase font-light mb-4"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: expo }}
          >
            {label}
          </motion.p>
        )}
        <motion.h1
          className="text-4xl md:text-6xl lg:text-8xl font-[100] text-gray-900 tracking-tight leading-[0.95]"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1, ease: expo }}
        >
          {title}
          {titleLine2 && <><br />{titleLine2}</>}
        </motion.h1>
        {meta.length > 0 && (
          <motion.div
            className="flex items-center gap-4 md:gap-6 mt-5 flex-wrap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: expo }}
          >
            {meta.map((item, i) => (
              <span key={i} className="flex items-center gap-4 md:gap-6">
                {i > 0 && <span className="w-5 h-px bg-gray-300" />}
                <span className="text-xs text-gray-400 font-mono tracking-wider">{item}</span>
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
        transition={{ delay: 1.2, duration: 0.6 }}
      >
        <motion.div
          className="w-px h-7 bg-gray-400/50 origin-top"
          animate={{ scaleY: [0, 1, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </section>
  );
}
