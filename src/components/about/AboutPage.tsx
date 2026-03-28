import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';

/* ───── Easing ───── */
const expo = [0.16, 1, 0.3, 1] as const;

/* ───── Data ───── */
const stats = [
  { value: 14, suffix: '+', label: 'Photographs' },
  { value: 3, suffix: '', label: 'Collections' },
  { value: 5, suffix: '+', label: 'Cities' },
  { value: 1, suffix: '', label: 'Camera' },
];

const skills = [
  'Photography', 'Lightroom', 'Photoshop', 'Nikon Zf',
  'Street', 'Portrait', 'Landscape', 'Architecture',
  'Color Grading', 'Composition', 'Travel', 'Editorial',
];

const timeline = [
  { year: '2025', title: 'Tokyo Neon Series', desc: 'Captured the duality of ancient temples and neon-lit streets across Japan. A study in contrast and coexistence.' },
  { year: '2024', title: 'New York Stories', desc: 'A visual journey through the streets, architecture, and energy of New York City. Light and shadow in the city that never sleeps.' },
  { year: '2024', title: 'Paris Lumière', desc: 'The timeless elegance and romantic atmosphere of Paris. Capturing the eternal city of light through a modern lens.' },
  { year: '2024', title: 'Greek Islands', desc: 'Sun-kissed walls and endless blue of the Mediterranean. The iconic whitewashed beauty under warm Aegean light.' },
  { year: '2023', title: 'Started Photography', desc: 'Picked up my first camera and fell in love with the art of seeing. Every journey begins with a single frame.' },
];

const philosophy = [
  { title: 'Light', desc: 'Every image begins with how light falls. I chase the golden hour, the haze, the way shadows sculpt a scene into something cinematic.' },
  { title: 'Intention', desc: 'A camera is a tool for seeing. I photograph not what I find, but what I feel — the tension between stillness and motion.' },
  { title: 'Story', desc: 'Each frame holds a narrative that unfolds in silence. The viewer completes the story with their own memory and emotion.' },
];

/* ───── Animated counter hook ───── */
function useCounter(end: number, inView: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1600;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setCount(Math.round(eased * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [end, inView]);
  return count;
}

/* ───── CounterCard ───── */
function CounterCard({ value, suffix, label, index }: { value: number; suffix: string; label: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const count = useCounter(value, isInView);

  return (
    <motion.div
      ref={ref}
      className="text-center"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, delay: index * 0.12, ease: expo }}
    >
      <span className="text-5xl md:text-7xl font-[100] text-gray-900 tabular-nums tracking-tight">
        {count}{suffix}
      </span>
      <p className="text-[10px] md:text-xs text-gray-400 uppercase tracking-[0.25em] mt-3 font-light">
        {label}
      </p>
    </motion.div>
  );
}

/* ───── Philosophy Card ───── */
function PhilosophyCard({ title, desc, index }: { title: string; desc: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <motion.div
      ref={ref}
      className="group relative p-8 md:p-10 rounded-3xl border border-gray-100 bg-white hover:border-gray-200 transition-all duration-700"
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.9, delay: index * 0.15, ease: expo }}
      whileHover={{ y: -4, transition: { duration: 0.4 } }}
    >
      {/* Number accent */}
      <span className="absolute top-6 right-8 text-[80px] md:text-[100px] font-[100] text-gray-50 leading-none select-none pointer-events-none group-hover:text-gray-100 transition-colors duration-700">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="relative z-10">
        <h3 className="text-2xl md:text-3xl font-[200] text-gray-900 tracking-tight">{title}</h3>
        <div className="w-8 h-px bg-gray-900/20 mt-4 mb-5 group-hover:w-16 transition-all duration-700" />
        <p className="text-sm md:text-base text-gray-400 font-light leading-relaxed max-w-sm">{desc}</p>
      </div>
    </motion.div>
  );
}

/* ═════════════════════ MAIN COMPONENT ═════════════════════ */
export default function AboutPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  // Parallax transforms
  const heroImgY = useTransform(heroProgress, [0, 1], [0, 120]);
  const heroImgScale = useTransform(heroProgress, [0, 1], [1, 1.08]);
  const heroTextY = useTransform(heroProgress, [0, 1], [0, -60]);
  const heroOpacity = useTransform(heroProgress, [0, 0.6], [1, 0]);
  const smoothImgY = useSpring(heroImgY, { stiffness: 80, damping: 30 });
  const smoothTextY = useSpring(heroTextY, { stiffness: 80, damping: 30 });

  return (
    <div className="bg-white">

      {/* ═══════ HERO — Full-bleed parallax portrait ═══════ */}
      <section ref={heroRef} className="relative h-[85vh] md:h-screen overflow-hidden">
        {/* Background image with parallax */}
        <motion.div
          className="absolute inset-0"
          style={{ y: smoothImgY, scale: heroImgScale }}
        >
          <img
            src="https://cdn.sanity.io/images/z610fooo/production/926d2d1c1fcba0de3a1b45fd60b64e7fce7ce650-3300x2200.jpg?auto=format&w=1800&q=85"
            alt="Ryan Xu"
            className="w-full h-full object-cover object-right"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/30 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-white/60 via-transparent to-transparent" />
        </motion.div>

        {/* Hero text — pinned bottom-left */}
        <motion.div
          className="absolute bottom-16 md:bottom-24 left-6 md:left-16 z-10"
          style={{ y: smoothTextY, opacity: heroOpacity }}
        >
          <motion.p
            className="text-[10px] md:text-xs tracking-[0.4em] text-gray-500 uppercase font-light mb-4"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: expo }}
          >
            About the Photographer
          </motion.p>
          <motion.h1
            className="text-5xl md:text-7xl lg:text-8xl font-[100] text-gray-900 tracking-tight leading-[0.95]"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.1, ease: expo }}
          >
            Ryan<br />Xu.
          </motion.h1>
          <motion.div
            className="flex items-center gap-6 mt-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: expo }}
          >
            <span className="text-xs text-gray-400 font-mono tracking-wider">New York, NY</span>
            <span className="w-6 h-px bg-gray-300" />
            <span className="text-xs text-gray-400 font-mono tracking-wider">Nikon Zf</span>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
        >
          <motion.div
            className="w-px h-8 bg-gray-300 origin-top"
            animate={{ scaleY: [0, 1, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      </section>

      {/* ═══════ BIO — Split text reveal ═══════ */}
      <section className="px-6 md:px-16 py-28 md:py-40 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-start">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-120px' }}
            transition={{ duration: 1, ease: expo }}
          >
            <p className="text-[10px] tracking-[0.4em] text-gray-300 uppercase font-light mb-6">Story</p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-[100] text-gray-900 leading-[1.15] tracking-tight">
              I believe in capturing the quiet moments where light meets intention.
            </h2>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-120px' }}
            transition={{ duration: 1, delay: 0.2, ease: expo }}
            className="space-y-6"
          >
            <p className="text-base md:text-lg text-gray-400 font-light leading-relaxed">
              Every frame is a conversation — between subject and space, stillness and motion, the seen and the felt. Photography is not about documentation; it's about distillation.
            </p>
            <p className="text-base md:text-lg text-gray-400 font-light leading-relaxed">
              Based in New York, I shoot exclusively on the Nikon Zf. There's something about the weight of a real shutter, the intention behind each exposure, that digital convenience can never replace.
            </p>
            <div className="flex items-center gap-4 pt-4">
              <div className="w-12 h-px bg-gray-200" />
              <span className="text-[10px] text-gray-300 tracking-[0.3em] uppercase font-mono">Since 2023</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════ STATS — Animated counters ═══════ */}
      <section className="px-6 md:px-16 py-24 border-y border-gray-100">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-8">
          {stats.map((s, i) => (
            <CounterCard key={s.label} {...s} index={i} />
          ))}
        </div>
      </section>

      {/* ═══════ PHILOSOPHY — Three pillars ═══════ */}
      <section className="px-6 md:px-16 py-28 md:py-40 max-w-6xl mx-auto">
        <motion.div
          className="mb-16 md:mb-20"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: expo }}
        >
          <p className="text-[10px] tracking-[0.4em] text-gray-300 uppercase font-light mb-4">Philosophy</p>
          <h2 className="text-3xl md:text-4xl font-[100] text-gray-900 tracking-tight">
            Three principles behind every frame.
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {philosophy.map((item, i) => (
            <PhilosophyCard key={item.title} {...item} index={i} />
          ))}
        </div>
      </section>

      {/* ═══════ SKILLS — Staggered pills ═══════ */}
      <section className="px-6 md:px-16 py-20 bg-gray-50/50">
        <div className="max-w-5xl mx-auto">
          <motion.p
            className="text-[10px] tracking-[0.4em] text-gray-300 uppercase font-light mb-8"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Expertise
          </motion.p>
          <div className="flex flex-wrap gap-3">
            {skills.map((skill, i) => (
              <motion.span
                key={skill}
                className="px-5 py-2.5 text-sm font-light tracking-wide rounded-full border border-gray-200 text-gray-500 bg-white
                  hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-all duration-500 cursor-default"
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04, duration: 0.5, ease: expo }}
                whileHover={{ scale: 1.05 }}
              >
                {skill}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ JOURNEY — Horizontal timeline ═══════ */}
      <section className="py-28 md:py-40 overflow-hidden">
        <div className="px-6 md:px-16 max-w-6xl mx-auto mb-16">
          <motion.p
            className="text-[10px] tracking-[0.4em] text-gray-300 uppercase font-light mb-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Journey
          </motion.p>
          <motion.h2
            className="text-3xl md:text-4xl font-[100] text-gray-900 tracking-tight"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: expo }}
          >
            A timeline of visual exploration.
          </motion.h2>
        </div>

        {/* Horizontal scrolling timeline */}
        <div className="relative">
          {/* Horizontal line */}
          <motion.div
            className="absolute top-[30px] left-0 right-0 h-px bg-gray-100"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, ease: expo }}
            style={{ transformOrigin: 'left' }}
          />

          <div className="flex gap-8 px-6 md:px-16 pb-4 overflow-x-auto no-scrollbar">
            {timeline.map((item, i) => (
              <motion.div
                key={i}
                className="flex-shrink-0 w-72 md:w-80"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: expo }}
              >
                {/* Dot on timeline */}
                <div className="relative mb-8">
                  <motion.div
                    className="w-3 h-3 rounded-full border-2 border-gray-300 bg-white relative z-10"
                    whileInView={{ borderColor: '#111' }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                  />
                </div>
                {/* Card */}
                <div className="group">
                  <span className="text-[10px] font-mono text-gray-300 tracking-wider">{item.year}</span>
                  <h3 className="text-xl font-[200] text-gray-900 mt-2 tracking-tight group-hover:translate-x-1 transition-transform duration-500">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-400 font-light mt-3 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ EQUIPMENT — Minimal ═══════ */}
      <section className="px-6 md:px-16 py-20 border-t border-gray-100">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          {[
            { label: 'Camera', value: 'Nikon Zf' },
            { label: 'Based In', value: 'New York, NY' },
            { label: 'Focus', value: 'Street · Travel · Architecture' },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              className="text-center md:text-left"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.7, ease: expo }}
            >
              <p className="text-[10px] tracking-[0.3em] text-gray-300 uppercase font-mono mb-2">{item.label}</p>
              <p className="text-lg font-[200] text-gray-900 tracking-tight">{item.value}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="py-20 px-6 md:px-16 max-w-7xl mx-auto border-t border-gray-100">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-lg font-light text-gray-900 tracking-tight">Visual Archive.</h2>
            <p className="text-xs text-gray-400 mt-1 font-light">
              &copy; {new Date().getFullYear()} Ryan. All rights reserved.
            </p>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-400 font-mono">
            <span>Nikon Zf</span>
            <span className="text-gray-200">|</span>
            <span>Astro + React</span>
            <span className="text-gray-200">|</span>
            <span>Sanity CMS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
