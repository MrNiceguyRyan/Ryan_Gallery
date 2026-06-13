import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { SiteSettings, TimelineItem } from '../../types';
import Magnetic from '../shared/Magnetic';

const expo = [0.16, 1, 0.3, 1] as const;

// Organic "water-droplet" frame: a border-radius that morphs through a few
// asymmetric blob states so the avatar wobbles like a settling drop. The two
// arrays run at different tempos so the inner photo and outer halo are never
// perfectly in sync — the surface-tension shimmer.
const DROP_INNER = [
  '64% 36% 27% 73% / 66% 28% 72% 34%',
  '33% 67% 66% 34% / 36% 70% 30% 64%',
  '58% 42% 44% 56% / 26% 64% 36% 74%',
  '28% 72% 64% 36% / 68% 34% 66% 32%',
  '64% 36% 27% 73% / 66% 28% 72% 34%',
];
const DROP_OUTER = [
  '52% 48% 36% 64% / 60% 42% 58% 40%',
  '66% 34% 58% 42% / 34% 66% 36% 64%',
  '36% 64% 48% 52% / 62% 38% 64% 36%',
  '52% 48% 36% 64% / 60% 42% 58% 40%',
];

/** Fallback timeline shown when Sanity has no data yet. Only entries
 *  backed by real collections are listed. Future additions go through
 *  Sanity Studio, not this fallback. */
const FALLBACK_TIMELINE: TimelineItem[] = [
  { year: '2024', title: 'New York Stories', description: 'Streets, architecture, and the off-hours light of the five boroughs.' },
  { year: '2024', title: 'Southwest Sequence', description: 'Zion, Bryce Canyon, Page, and the Arizona high desert. Sandstone under hard sun.' },
  { year: '2024', title: 'Florida Coast', description: 'Miami and Orlando. Humid blues, neon greens, salt-bleached pastels.' },
  { year: '2023', title: 'Started Photography', description: 'First camera. First frame I cared about. Archive begins here.' },
];

interface Props {
  settings?: SiteSettings;
}

export default function AboutPage({ settings }: Props) {
  const name      = settings?.name      ?? 'Ryan Xu';
  const bio       = settings?.bio       ?? null;
  const avatarUrl = settings?.avatarUrl ?? 'https://cdn.sanity.io/images/z610fooo/production/926d2d1c1fcba0de3a1b45fd60b64e7fce7ce650-3300x2200.jpg?auto=format&w=400&h=400&fit=crop&crop=right&q=80';
  const email     = settings?.email     ?? 'ryan2420159421@gmail.com';
  const instagram = settings?.instagram ?? 'https://www.instagram.com/ryan_photoo/';
  const timeline  = (settings?.timeline?.length ?? 0) > 0
    ? settings!.timeline!
    : FALLBACK_TIMELINE;
  const reduce = useReducedMotion();
  const igHandle = '@' + (instagram.replace(/\/+$/, '').split('/').pop() || 'instagram');

  // Editorial "contributor cover" entrance — plays once on arrival, then
  // peels away to reveal the page.
  const [coverGone, setCoverGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCoverGone(true), 1150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="bg-[#0A0A0A] text-[#FDFDFB] min-h-[100dvh]">
      {/* ═══════ Entrance — magazine "contributor" cover ═══════ */}
      <AnimatePresence>
        {!coverGone && (
          <motion.div
            key="about-cover"
            initial={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ duration: 0.85, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-[60] bg-[#0A0A0A] text-[#FDFDFB] overflow-hidden"
          >
            {/* Newsprint halftone + warm accent wash */}
            <div className="absolute inset-0 newsprint-screen opacity-[0.05] pointer-events-none" />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(52vmax 42vmax at 20% 112%, rgba(255,200,130,0.10), transparent 68%)' }}
            />
            {/* Newspaper column rules */}
            <div className="absolute inset-0 grid grid-cols-4 opacity-50 pointer-events-none">
              {[0, 1, 2, 3].map((i) => (
                <motion.span
                  key={i}
                  className="origin-top"
                  style={{ borderRight: i === 3 ? '0' : '1px solid rgba(255,255,255,0.05)' }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.7, delay: 0.05 + i * 0.06, ease: expo }}
                />
              ))}
            </div>

            {/* Masthead */}
            <motion.div
              className="absolute"
              style={{ top: 'clamp(1.5rem,4vh,3rem)', left: 'clamp(1.5rem,5vw,4rem)', right: 'clamp(1.5rem,5vw,4rem)' }}
              initial={{ clipPath: 'inset(0 100% 0 0)' }}
              animate={{ clipPath: 'inset(0 0% 0 0)' }}
              transition={{ duration: 0.65, delay: 0.1, ease: expo }}
            >
              <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-white/20 font-mono text-[10px] tracking-[0.42em] uppercase">
                <span className="font-medium text-white/60">The Journal Gallery</span>
                <span className="text-white/35">The Profile</span>
              </div>
              <div className="mt-[3px] border-b border-white/10" />
            </motion.div>

            {/* Center block */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center" style={{ paddingLeft: '6vw', paddingRight: '6vw' }}>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.22, ease: expo }}
                className="font-mono text-[11px] tracking-[0.5em] uppercase"
                style={{ color: 'rgba(255,200,130,0.85)' }}
              >
                Photographer
              </motion.span>
              <h1 className="m-0 overflow-hidden" style={{ padding: '0.04em 0.02em' }}>
                <motion.span
                  initial={{ y: '110%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.85, delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-block font-serif italic font-normal leading-[0.92] tracking-tight text-white/[0.98]"
                  style={{ fontSize: 'clamp(52px,12vw,150px)' }}
                >
                  {name}
                </motion.span>
              </h1>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.46, ease: expo }}
                className="flex items-center gap-3 font-mono text-[10px] tracking-[0.34em] uppercase text-white/40"
              >
                <span>New York, NY</span>
              </motion.div>
            </div>

            {/* Folio — camera EXIF line for the photography theme */}
            <motion.div
              className="absolute flex items-baseline justify-between gap-4 pt-2 border-t border-white/20 font-mono text-[10px] tracking-[0.42em] uppercase text-white/35"
              style={{ bottom: 'clamp(1.5rem,4vh,3rem)', left: 'clamp(1.5rem,5vw,4rem)', right: 'clamp(1.5rem,5vw,4rem)' }}
              initial={{ clipPath: 'inset(0 0 0 100%)' }}
              animate={{ clipPath: 'inset(0 0 0 0%)' }}
              transition={{ duration: 0.65, delay: 0.12, ease: expo }}
            >
              <span className="text-[13px] tracking-[0.2em] text-white/55">Contributor</span>
              <span className="hidden sm:block">Nikon Zf · Fujifilm X-T50</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ═══════ HERO — editorial split: portrait left, profile right ═══════ */}
      <section className="pt-28 md:pt-36 pb-10 px-6 md:px-16 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-12 gap-10 md:gap-12 items-start">

          {/* ── LEFT: water-droplet portrait + stacked meta ── */}
          <div className="md:col-span-5 flex flex-col items-start gap-7">
            {/* Avatar — a water-droplet frame: settles in, then floats while its
                edge morphs like a slowly wobbling drop, wrapped in a soft halo. */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: expo }}
            >
              <motion.div
                className="relative w-40 h-40 md:w-52 md:h-52"
                animate={reduce ? undefined : { y: [0, -7, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              >
                {/* Liquid halo — morphs out of phase + drifts, for surface tension */}
                <motion.div
                  aria-hidden
                  className="absolute -inset-3 -z-10 blur-xl"
                  style={{
                    borderRadius: DROP_OUTER[0],
                    background:
                      'radial-gradient(circle at 36% 30%, rgba(255,200,130,0.34), rgba(255,255,255,0.05) 58%, transparent 74%)',
                  }}
                  animate={reduce ? undefined : { borderRadius: DROP_OUTER, rotate: [0, 7, 0], scale: [1, 1.06, 1] }}
                  transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
                />
                {/* The droplet — morphing border-radius clips the photo */}
                <motion.div
                  className="relative w-full h-full overflow-hidden bg-white/5 shadow-xl ring-1 ring-white/15"
                  style={{ borderRadius: DROP_INNER[0] }}
                  animate={reduce ? undefined : { borderRadius: DROP_INNER, scale: [1, 1.045, 0.99, 1] }}
                  transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="w-full h-full object-cover object-right scale-105"
                    loading="eager"
                    decoding="async"
                    draggable={false}
                  />
                  {/* Specular gloss — the water-drop sheen, top-left (subtle) */}
                  <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none mix-blend-screen"
                    style={{
                      background:
                        'radial-gradient(40% 30% at 30% 22%, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 46%, transparent 64%)',
                    }}
                  />
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Stacked identity meta — one fact per line (no middle-dot pileup) */}
            <motion.dl
              className="font-mono text-[11px] leading-relaxed text-white/45 space-y-1.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: expo }}
            >
              <div className="text-white/70">Photographer</div>
              <div>New York, NY</div>
              <div>Fujifilm X-T50 · Nikon Zf</div>
              <div className="pt-2.5 mt-1 border-t border-white/10 tracking-[0.3em] uppercase text-white/30 text-[10px]">
                Since 2023
              </div>
            </motion.dl>
          </div>

          {/* ── RIGHT: name + bio ── */}
          <div className="md:col-span-7">
            {/* Name — mask reveal. leading-[1.1] keeps the italic 'y' descender
                clear of the overflow-hidden mask. */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif italic text-[#FDFDFB] tracking-tighter leading-[1.1] overflow-hidden pb-2">
              <motion.span
                className="block"
                initial={{ y: '110%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 0.9, delay: 0.15, ease: expo }}
              >
                {name}.
              </motion.span>
            </h1>

            {/* Bio — prose section. Override the fallback by filling
                 `siteSettings.bio` in Sanity Studio. */}
            {bio ? (
              <motion.div
                className="mt-7"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3, ease: expo }}
              >
                <p className="text-[15px] text-white/55 font-light leading-relaxed max-w-[60ch] whitespace-pre-line">
                  {bio}
                </p>
              </motion.div>
            ) : (
              <motion.div
                className="mt-7 space-y-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3, ease: expo }}
              >
                {/* Statement — prose introduction */}
                <div className="space-y-4 text-[14.5px] md:text-[15px] text-white/55 font-light leading-[1.75] max-w-[60ch]">
                  <p>
                    A photographic record of moving through cities and
                    landscapes, from the high-contrast geometry of Manhattan to
                    the geologic time of the American Southwest. No commissioned
                    work, no client briefs. Frames selected on a slow timeline,
                    organized by location, dated.
                  </p>
                  <p>
                    Off the camera: engineering and AI research. The discipline
                    of careful observation transfers between the two; both
                    reward patience over output volume. This site is one node in
                    a personal archive, not a portfolio for hire.
                  </p>
                </div>

                {/* Metadata block — terse system signature below the prose */}
                <div className="space-y-2.5 max-w-md font-mono text-[12px] pt-4 border-t border-white/5">
                  <div className="flex items-baseline gap-4">
                    <span className="text-white/30 tracking-[0.3em] uppercase shrink-0 w-16">Focus</span>
                    <span className="text-white/60">Light. Geometry. Stillness.</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="text-white/30 tracking-[0.3em] uppercase shrink-0 w-16">Method</span>
                    <span className="text-white/60">One frame at a time. Real shutter, real exposure.</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="text-white/30 tracking-[0.3em] uppercase shrink-0 w-16">Log</span>
                    <span className="text-white/60">Personal archive, selected frames only.</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════ TIMELINE ═══════ */}
      <motion.section
        className="py-12 md:py-16 overflow-hidden border-t border-white/5"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.8, ease: expo }}
      >
        <div className="px-6 md:px-16 max-w-5xl mx-auto mb-8">
          <h2 className="text-xl md:text-2xl font-serif italic text-[#FDFDFB] tracking-tighter overflow-hidden py-1">
            <motion.span
              className="block"
              initial={{ y: '120%' }}
              whileInView={{ y: '0%' }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.8, ease: expo }}
            >
              Timeline.
            </motion.span>
          </h2>
        </div>

        <div className="relative">
          <motion.div
            className="absolute top-[20px] left-0 right-0 h-px bg-white/10"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: expo }}
            style={{ transformOrigin: 'left' }}
          />
          <div
            className="flex gap-5 px-6 md:px-16 pb-4 overflow-x-auto no-scrollbar snap-x snap-mandatory md:snap-none"
            style={{ scrollPaddingInline: '1.5rem' }}
          >
            {timeline.map((item, i) => (
              <motion.div
                key={`${item.year}-${i}`}
                className="flex-shrink-0 w-56 md:w-64 group snap-start"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.07, ease: expo }}
              >
                <div className="relative mb-5">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-white/20 bg-[#0A0A0A] relative z-10 transition-all duration-500 group-hover:border-[rgba(255,200,130,0.9)] group-hover:shadow-[0_0_10px_rgba(255,200,130,0.5)]" />
                </div>
                <span className="text-[10px] font-mono text-white/30 tracking-wider">{item.year}</span>
                <h3 className="text-base font-light text-[#FDFDFB] mt-1 tracking-tight group-hover:translate-x-1 transition-transform duration-400">
                  {item.title}
                </h3>
                <p className="text-[13px] text-white/40 font-light mt-1.5 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ═══════ CONTACT ═══════ */}
      <motion.section
        className="px-6 md:px-16 py-12 md:py-16 border-t border-white/5"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.8, ease: expo }}
      >
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl md:text-2xl font-serif italic text-[#FDFDFB] tracking-tighter mb-6 overflow-hidden py-1">
            <motion.span
              className="block"
              initial={{ y: '120%' }}
              whileInView={{ y: '0%' }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.8, ease: expo }}
            >
              Contact.
            </motion.span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.06]">
            <motion.a
              href={`mailto:${email}`}
              className="group relative p-5 bg-[#0A0A0A] hover:bg-white/[0.04] transition-colors duration-300 flex items-center gap-3.5"
              whileHover={{ transition: { duration: 0.2 } }}
            >
              <svg className="w-4 h-4 text-white/35 shrink-0 group-hover:text-[rgba(255,200,130,0.95)] transition-colors duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <div className="min-w-0">
                <p className="font-mono text-[9px] tracking-[0.32em] uppercase text-white/30 mb-1">Email</p>
                <p className="text-sm font-light text-white/80 truncate">{email}</p>
              </div>
              <span aria-hidden className="ml-auto pl-2 text-white/20 group-hover:text-white/55 group-hover:translate-x-0.5 transition-all duration-300">↗</span>
            </motion.a>

            <motion.a
              href={instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative p-5 bg-[#0A0A0A] hover:bg-white/[0.04] transition-colors duration-300 flex items-center gap-3.5"
              whileHover={{ transition: { duration: 0.2 } }}
            >
              <svg className="w-4 h-4 text-white/35 shrink-0 group-hover:text-[rgba(255,200,130,0.95)] transition-colors duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
              <div className="min-w-0">
                <p className="font-mono text-[9px] tracking-[0.32em] uppercase text-white/30 mb-1">Social</p>
                <p className="text-sm font-light text-white/80 truncate">{igHandle}</p>
              </div>
              <span aria-hidden className="ml-auto pl-2 text-white/20 group-hover:text-white/55 group-hover:translate-x-0.5 transition-all duration-300">↗</span>
            </motion.a>

            <div className="p-5 bg-[#0A0A0A] flex items-center gap-3.5">
              <svg className="w-4 h-4 text-white/35 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <div className="min-w-0">
                <p className="font-mono text-[9px] tracking-[0.32em] uppercase text-white/30 mb-1">Based</p>
                <p className="text-sm font-light text-white/55">New York, NY</p>
              </div>
            </div>

            <div className="p-5 bg-[#0A0A0A] flex items-center gap-3.5">
              <svg className="w-4 h-4 text-white/35 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
              </svg>
              <div className="min-w-0">
                <p className="font-mono text-[9px] tracking-[0.32em] uppercase text-white/30 mb-1">Reply</p>
                <p className="text-sm font-light text-white/55">Open to conversation, not client briefs</p>
              </div>
            </div>
          </div>

          <motion.div
            className="mt-8 text-center"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: expo }}
          >
            <Magnetic strength={0.5}>
              <a
                href={`mailto:${email}`}
                className="inline-block px-7 py-2.5 bg-white text-black text-sm font-light tracking-wider rounded-full hover:bg-white/80 transition-colors duration-300"
              >
                Get in Touch
              </a>
            </Magnetic>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
}
