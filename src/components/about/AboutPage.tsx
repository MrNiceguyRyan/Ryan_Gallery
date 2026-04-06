import { motion } from 'framer-motion';
import type { SiteSettings, TimelineItem } from '../../types';

const expo = [0.16, 1, 0.3, 1] as const;

/** Fallback timeline shown when Sanity has no data yet */
const FALLBACK_TIMELINE: TimelineItem[] = [
  { year: '2025', title: 'Tokyo Neon Series', description: 'Captured the duality of ancient temples and neon-lit streets across Japan.' },
  { year: '2024', title: 'New York Stories', description: 'A visual journey through the streets, architecture, and energy of New York City.' },
  { year: '2024', title: 'Paris Lumière', description: 'The timeless elegance and romantic atmosphere of Paris through a modern lens.' },
  { year: '2024', title: 'Greek Islands', description: 'Sun-kissed walls and endless blue of the Mediterranean under warm Aegean light.' },
  { year: '2023', title: 'Started Photography', description: 'Picked up my first camera and fell in love with the art of seeing.' },
];

interface Props {
  settings?: SiteSettings;
}

export default function AboutPage({ settings }: Props) {
  const name      = settings?.name      ?? 'Ryan Xu';
  const bio       = settings?.bio       ?? null;
  const avatarUrl = settings?.avatarUrl ?? 'https://cdn.sanity.io/images/z610fooo/production/926d2d1c1fcba0de3a1b45fd60b64e7fce7ce650-3300x2200.jpg?auto=format&w=400&h=400&fit=crop&crop=right&q=80';
  const email     = settings?.email     ?? 'hello@ryanxu.com';
  const instagram = settings?.instagram ?? 'https://instagram.com';
  const timeline  = (settings?.timeline?.length ?? 0) > 0
    ? settings!.timeline!
    : FALLBACK_TIMELINE;

  return (
    <div className="bg-white">

      {/* ═══════ HERO — Avatar + Name centered top ═══════ */}
      <section className="pt-28 md:pt-36 pb-10 px-6 md:px-16 max-w-3xl mx-auto text-center">
        {/* Avatar */}
        <motion.div
          className="flex justify-center mb-6"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: expo }}
        >
          <div className="w-28 h-28 md:w-36 md:h-36 animate-blob-morph overflow-hidden bg-gray-100 shadow-lg">
            <img
              src={avatarUrl}
              alt={name}
              className="w-full h-full object-cover object-right"
              loading="eager"
              decoding="async"
            />
          </div>
        </motion.div>

        {/* Name */}
        <motion.h1
          className="text-4xl md:text-5xl font-[100] text-gray-900 tracking-tight leading-[0.95]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: expo }}
        >
          {name}.
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="text-xs text-gray-400 font-mono tracking-wider mt-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: expo }}
        >
          Photographer · New York, NY · Nikon Zf
        </motion.p>

        {/* Bio */}
        {bio ? (
          <motion.div
            className="mt-8 text-left md:text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: expo }}
          >
            <p className="text-[15px] text-gray-400 font-light leading-relaxed max-w-xl mx-auto">
              {bio}
            </p>
          </motion.div>
        ) : (
          <motion.div
            className="mt-8 space-y-4 text-left md:text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: expo }}
          >
            <p className="text-[15px] text-gray-400 font-light leading-relaxed max-w-xl mx-auto">
              I believe in capturing the quiet moments where light meets intention.
              Every frame is a conversation — between subject and space, stillness and motion, the seen and the felt.
            </p>
            <p className="text-[15px] text-gray-400 font-light leading-relaxed max-w-xl mx-auto">
              Based in New York, I shoot exclusively on the Nikon Zf. There's something about the weight of a real shutter,
              the intention behind each exposure, that digital convenience can never replace.
            </p>
          </motion.div>
        )}

        <motion.div
          className="flex items-center gap-4 mt-5 justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="w-10 h-px bg-gray-200" />
          <span className="text-[10px] text-gray-300 tracking-[0.3em] uppercase font-mono">Since 2023</span>
          <div className="w-10 h-px bg-gray-200" />
        </motion.div>
      </section>

      {/* ═══════ TIMELINE ═══════ */}
      <motion.section
        className="py-12 md:py-16 overflow-hidden border-t border-gray-50"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.8, ease: expo }}
      >
        <div className="px-6 md:px-16 max-w-5xl mx-auto mb-8">
          <motion.h2
            className="text-xl md:text-2xl font-[100] text-gray-900 tracking-tight"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: expo }}
          >
            A timeline of visual exploration.
          </motion.h2>
        </div>

        <div className="relative">
          <motion.div
            className="absolute top-[20px] left-0 right-0 h-px bg-gray-100"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: expo }}
            style={{ transformOrigin: 'left' }}
          />
          <div className="flex gap-5 px-6 md:px-16 pb-4 overflow-x-auto no-scrollbar">
            {timeline.map((item, i) => (
              <motion.div
                key={`${item.year}-${i}`}
                className="flex-shrink-0 w-56 md:w-64 group"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.07, ease: expo }}
              >
                <div className="relative mb-5">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-200 bg-white relative z-10 group-hover:border-gray-900 transition-colors duration-500" />
                </div>
                <span className="text-[10px] font-mono text-gray-300 tracking-wider">{item.year}</span>
                <h3 className="text-base font-[200] text-gray-900 mt-1 tracking-tight group-hover:translate-x-1 transition-transform duration-400">
                  {item.title}
                </h3>
                <p className="text-[13px] text-gray-400 font-light mt-1.5 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ═══════ CONTACT ═══════ */}
      <motion.section
        className="px-6 md:px-16 py-12 md:py-16 border-t border-gray-100"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.8, ease: expo }}
      >
        <div className="max-w-3xl mx-auto">
          <motion.h2
            className="text-xl md:text-2xl font-[100] text-gray-900 tracking-tight mb-6"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: expo }}
          >
            Contact Me
          </motion.h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <motion.a
              href={`mailto:${email}`}
              className="group p-5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors duration-300 flex items-center gap-3"
              whileHover={{ y: -2, transition: { duration: 0.2 } }}
            >
              <svg className="w-4 h-4 text-gray-300 shrink-0 group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <div>
                <p className="text-sm font-light text-gray-900">{email}</p>
              </div>
            </motion.a>

            <motion.a
              href={instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="group p-5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors duration-300 flex items-center gap-3"
              whileHover={{ y: -2, transition: { duration: 0.2 } }}
            >
              <svg className="w-4 h-4 text-gray-300 shrink-0 group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
              <div>
                <p className="text-sm font-light text-gray-900">Instagram</p>
              </div>
            </motion.a>

            <div className="p-5 rounded-xl bg-gray-50 flex items-center gap-3">
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <p className="text-sm font-light text-gray-500">New York / Worldwide</p>
            </div>

            <div className="p-5 rounded-xl bg-gray-50 flex items-center gap-3">
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
              <p className="text-sm font-light text-gray-500">Open for collaborations</p>
            </div>
          </div>

          <motion.div
            className="mt-8 text-center"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: expo }}
          >
            <a
              href={`mailto:${email}`}
              className="inline-block px-7 py-2.5 bg-gray-900 text-white text-sm font-light tracking-wider rounded-full hover:bg-gray-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              Get in Touch
            </a>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
}
