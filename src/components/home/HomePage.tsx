import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'framer-motion';
import { ArrowRight, Camera } from 'lucide-react';
import type { Collection, Photo } from '../../types';
import OpeningAnimation from './OpeningAnimation';
import ParticleTitle from './ParticleTitle';
import EtherealAudio from './EtherealAudio';
import SidebarItem from './SidebarItem';
import ArchiveChapter from './ArchiveChapter';
import MagazineLayout from './MagazineLayout';

const expo = [0.23, 1, 0.32, 1] as const;

interface Props {
  collections: Collection[];
  photos: Photo[];
}

/* ═══════════════════════════════════════════════════════
 *  MobileFilmstripItem — parallax mobile card
 * ═══════════════════════════════════════════════════════ */
function MobileFilmstripItem({
  collection,
  onClick,
}: {
  collection: Collection;
  onClick: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 70,
    damping: 20,
    restDelta: 0.001,
  });

  const y = useTransform(smoothProgress, [0, 1], ['-35%', '35%']);

  const coverUrl = collection.coverImageUrl
    ? `${collection.coverImageUrl}?auto=format&w=1200&q=80`
    : collection.photos?.[0]?.imageUrl
      ? `${collection.photos[0].imageUrl}?auto=format&w=1200&q=80`
      : '';

  return (
    <motion.div
      ref={containerRef}
      onClick={onClick}
      whileInView="active"
      viewport={{ margin: '-25% 0px -25% 0px' }}
      className="relative w-full h-[28vh] overflow-hidden cursor-pointer border-b border-white/5 block group"
    >
      {coverUrl && (
        <motion.img
          style={{ y }}
          src={coverUrl}
          alt={collection.name}
          variants={{
            active: { scale: 1.1, filter: 'grayscale(0%)' },
          }}
          initial={{ filter: 'grayscale(100%)', scale: 1 }}
          transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 -top-[35%] w-full h-[170%] object-cover object-center"
          draggable={false}
        />
      )}
      <motion.div
        variants={{ active: { backgroundColor: 'rgba(0,0,0,0.2)' } }}
        initial={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        transition={{ duration: 1 }}
        className="absolute inset-0 transition-colors"
      />

      {/* Centered Title */}
      <div className="absolute inset-0 flex items-center justify-center p-6 z-10 pointer-events-none">
        <h3 className="text-4xl text-white font-serif italic tracking-tighter text-center mix-blend-difference drop-shadow-lg">
          {collection.name}
        </h3>
      </div>

      {/* Right Slide-in Arrow */}
      <motion.div
        variants={{ active: { opacity: 1, x: 0 } }}
        initial={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.7 }}
        className="absolute right-6 bottom-8 flex items-center gap-2 z-10 text-white mix-blend-difference drop-shadow-md"
      >
        <span className="text-[9px] uppercase tracking-[0.4em] font-bold">Explore Story</span>
        <ArrowRight size={14} />
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  HomePage — atmospheric dark archive
 * ═══════════════════════════════════════════════════════ */
export default function HomePage({ collections, photos }: Props) {
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [showOpening, setShowOpening] = useState(false);
  const [isAudioTriggered, setIsAudioTriggered] = useState(false);
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);
  const { scrollYProgress } = useScroll();

  // Filter to collections that have photos
  const activeCollections = useMemo(
    () => collections.filter((c) => (c.photos?.length || 0) > 0),
    [collections],
  );

  // IntersectionObserver for sidebar active state
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace('archive-item-', '');
            setActiveArchiveId(id);
          }
        });
      },
      { threshold: 0.1, rootMargin: '-30% 0px -30% 0px' },
    );

    activeCollections.forEach((c) => {
      const el = document.getElementById(`archive-item-${c._id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [activeCollections]);

  useEffect(() => {
    if (!sessionStorage.getItem('opening-shown')) setShowOpening(true);
  }, []);

  const handleOpeningComplete = useCallback(() => {
    sessionStorage.setItem('opening-shown', '1');
    setShowOpening(false);
  }, []);

  useEffect(() => {
    const isOverlayOpen = !!selectedCollection;
    document.body.style.overflow = isOverlayOpen ? 'hidden' : 'auto';
    document.body.style.backgroundColor = '#0A0A0A';
    return () => {
      document.body.style.overflow = '';
      document.body.style.backgroundColor = '';
    };
  }, [selectedCollection]);

  // Scroll progress for sidebar bar
  const sidebarScrollWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <>
      {showOpening && <OpeningAnimation onComplete={handleOpeningComplete} />}

      <div
        className={`min-h-screen font-sans transition-colors duration-1000 apple-spring relative bg-[#0A0A0A] text-[#FDFDFB] ${
          showOpening ? 'opacity-0' : 'opacity-100 transition-opacity duration-700'
        }`}
      >
        {/* ── Global Grain & Texture Overlay ── */}
        <div className="noise-grain" />
        <div
          className={`ambient-glow transition-opacity duration-1000 ${
            selectedCollection ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* ── Background Video & Atmosphere Layer ── */}
        <div
          className={`fixed inset-0 pointer-events-none z-0 transition-opacity duration-1000 ${
            selectedCollection ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="absolute inset-0 bg-[#0A0A0A] z-0" />

          <div className="absolute inset-0 z-10 overflow-hidden lens-breathing shutter-flicker">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover grayscale opacity-[0.22] contrast-125"
            >
              <source
                src="https://assets.mixkit.co/videos/preview/mixkit-street-crosswalk-in-a-large-city-at-sunset-34305-preview.mp4"
                type="video/mp4"
              />
            </video>

            {/* Light Leak Layer */}
            <div
              className="absolute inset-0 z-30 opacity-[0.15] pointer-events-none mix-blend-screen bg-gradient-to-tr from-transparent via-orange-500/5 to-transparent animate-pulse"
              style={{ animationDuration: '10s' }}
            />

            {/* Video Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0A0A0A] z-20" />
            <div className="absolute inset-0 bg-black/40 z-20 shadow-[inset_0_0_150px_rgba(0,0,0,1)]" />
          </div>
        </div>

        {/* ── Subtle Grid Pattern ── */}
        <div
          className={`fixed inset-0 pointer-events-none z-[1] transition-opacity duration-1000 ${
            selectedCollection ? 'opacity-0' : 'opacity-[0.02]'
          }`}
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '100px 100px',
          }}
        />

        <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply z-[1] paper-texture" />

        {/* ── Cinematic Atmospheric Layers ── */}
        <div
          className={`fixed inset-0 pointer-events-none overflow-hidden z-[2] transition-opacity duration-1000 ${
            selectedCollection ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {/* Floating Digital Dust Particles */}
          {[...Array(40)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-[1px] h-[1px] bg-white rounded-full opacity-[0.08]"
              initial={{
                x: Math.random() * 100 + '%',
                y: Math.random() * 100 + '%',
                scale: Math.random() * 0.5 + 0.5,
              }}
              animate={{
                y: [null, (Math.random() - 0.5) * 400 + 'px'],
                x: [null, (Math.random() - 0.5) * 200 + 'px'],
                opacity: [0.02, 0.1, 0.02],
              }}
              transition={{
                duration: 15 + Math.random() * 30,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}

          {/* Floating Parallax Grid Elements */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={`grid-${i}`}
              className="absolute inset-0 opacity-[0.02]"
              initial={{ rotate: 15 + i * 15, scale: 1.2 }}
              animate={{
                x: [(i - 1) * 20, (i - 1) * -20],
                y: [(i - 1) * 20, (i - 1) * -20],
              }}
              transition={{
                duration: 30 + i * 10,
                repeat: Infinity,
                repeatType: 'reverse',
                ease: 'easeInOut',
              }}
              style={{
                backgroundImage:
                  'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
                backgroundSize: `${100 + i * 50}px ${100 + i * 50}px`,
              }}
            />
          ))}

          {/* Subtle Depth Glows */}
          <div className="absolute inset-0 opacity-[0.05] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.15)_0%,transparent_70%)]" />
        </div>

        <div
          className={`fixed inset-x-0 top-0 h-[100vh] pointer-events-none z-[2] transition-opacity duration-1000 sunbeam opacity-[0.4] ${
            selectedCollection ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* ── Nav — signature font + pill buttons ── */}
        <nav className="fixed top-0 left-0 w-full z-50 px-6 py-8 md:px-12 flex justify-between items-center bg-transparent">
          <button
            onClick={() => {
              setSelectedCollection(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-3 hover:opacity-60 transition-all font-signature text-3xl md:text-4xl text-[#FDFDFB] mix-blend-difference"
          >
            Ryan Xu
          </button>

          <div className="flex items-center gap-2 md:gap-3">
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href="/travel"
              className="px-4 md:px-6 py-2 rounded-full text-[10px] uppercase tracking-[0.3em] font-bold transition-all duration-500 border border-white/20 bg-white/5 hover:bg-white/10 text-white backdrop-blur-md"
            >
              Map
            </motion.a>

            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href="/about"
              className="px-4 md:px-6 py-2 rounded-full text-[10px] uppercase tracking-[0.3em] font-bold transition-all duration-500 border border-white/20 bg-white/5 hover:bg-white/10 text-white backdrop-blur-md"
            >
              About
            </motion.a>
          </div>
        </nav>

        {/* ── Hero Header ── */}
        <header className="h-[100vh] flex flex-col justify-center items-center text-center px-6 relative overflow-hidden">
          {/* Corner System Status Labels */}
          <div className="absolute top-12 left-12 z-50 pointer-events-none hidden md:block">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.2 }}
              transition={{ delay: 1, duration: 2 }}
              className="flex flex-col gap-1 font-mono text-[6px] tracking-[0.4em] uppercase"
            >
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 bg-white animate-pulse" />
                <span>System.Core_Active</span>
              </div>
              <span className="opacity-50">Stability: 99.98%</span>
            </motion.div>
          </div>

          <div className="absolute top-12 right-12 z-50 pointer-events-none hidden md:block">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.2 }}
              transition={{ delay: 1.2, duration: 2 }}
              className="flex flex-col items-end gap-1 font-mono text-[6px] tracking-[0.4em] uppercase"
            >
              <div className="flex items-center gap-2">
                <span>Syncing_Archive</span>
                <div className="w-1 h-3 border-l border-white/30 animate-[pulse_2s_infinite]" />
              </div>
              <span className="opacity-50">Encryption: AES-256</span>
            </motion.div>
          </div>

          <div className="absolute bottom-12 right-12 z-50 pointer-events-none hidden md:block">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.2 }}
              transition={{ delay: 1.5, duration: 2 }}
              className="flex flex-col items-end gap-1 font-mono text-[6px] tracking-[0.4em] uppercase"
            >
              <span>Node_NRT.Gallery.V10</span>
              <span className="opacity-50">Local_Time: {new Date().toLocaleTimeString()}</span>
            </motion.div>
          </div>

          {/* Memory Assembly Intro (Metadata Flashes) */}
          <motion.div
            className="absolute inset-x-0 top-1/3 z-50 pointer-events-none flex flex-col items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0, 1, 0] }}
            transition={{ duration: 0.8, times: [0, 0.2, 0.4, 0.6, 1], ease: 'linear' }}
          >
            <div className="flex gap-12 font-mono text-[8px] tracking-[0.5em] opacity-40">
              <span>LAT 35.6895&deg; N</span>
              <span>SHUTTER 1/125</span>
              <span>F1.2</span>
              <span>LONG 139.6917&deg; E</span>
            </div>
            <div className="w-64 h-[1px] bg-white/10" />
            <div className="text-[7px] font-mono opacity-20 uppercase tracking-[1em]">
              Scanning Archives...
            </div>
          </motion.div>

          {/* Header content */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 1, ease: expo }}
            className="relative z-10 space-y-12"
          >
            <div className="flex flex-col items-center gap-6">
              <motion.span
                initial={{ opacity: 0, letterSpacing: '4em' }}
                animate={{ opacity: 0.3, letterSpacing: '2em' }}
                transition={{ delay: 0.1, duration: 1.5 }}
                className="text-[9px] uppercase block font-bold"
              >
                The Act of Remembering
              </motion.span>
              <div className="w-[1px] h-20 bg-gradient-to-b from-white/30 to-transparent" />
            </div>

            <div className="space-y-4 max-w-7xl w-full mx-auto">
              <EtherealAudio isTriggered={isAudioTriggered} />
              <ParticleTitle
                text="Journal <br/> Gallery"
                className="h-64 md:h-96"
                onHover={setIsAudioTriggered}
              />

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                transition={{ delay: 1.2, duration: 1 }}
                className="text-[10px] md:text-[12px] uppercase tracking-[0.6em] font-medium max-w-sm mx-auto leading-relaxed pt-12"
              >
                Capturing the microscopic eternity <br /> between light and dust.
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 1 }}
              className="flex items-center justify-center gap-16 pt-16"
            >
              <div className="w-16 h-[1px] bg-white opacity-5" />
              <div className="flex items-center gap-6">
                <span className="text-[9px] font-mono opacity-20">REF &numero;</span>
                <span className="text-[10px] uppercase tracking-[0.4em] opacity-30 font-bold">
                  Vol. {activeCollections.length} Archive
                </span>
              </div>
              <div className="w-16 h-[1px] bg-white opacity-5" />
            </motion.div>
          </motion.div>
        </header>

        {/* ── Desktop Main — sidebar + archive chapters ── */}
        <main className="hidden md:block max-w-7xl mx-auto px-6 md:px-12 pb-64 relative z-10">
          {/* Dynamic Ambient Background Aura */}
          <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
            <AnimatePresence mode="wait">
              {activeArchiveId && (
                <motion.div
                  key={activeArchiveId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.15 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2, ease: 'easeInOut' }}
                  className="absolute inset-0"
                >
                  {(() => {
                    const activeCol = activeCollections.find((c) => c._id === activeArchiveId);
                    const bgUrl = activeCol?.coverImageUrl || activeCol?.photos?.[0]?.imageUrl;
                    return bgUrl ? (
                      <>
                        <img
                          src={`${bgUrl}?auto=format&w=800&q=40`}
                          className="w-full h-full object-cover blur-[120px] scale-110 grayscale"
                          alt=""
                        />
                        <div className="absolute inset-0 bg-black/40" />
                      </>
                    ) : null;
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Decorative Grid Lines */}
          <div className="fixed left-24 top-0 bottom-0 w-px bg-white/[0.03] z-0 hidden lg:block" />
          <div className="fixed right-24 top-0 bottom-0 w-px bg-white/[0.03] z-0 hidden lg:block" />

          <div className="flex flex-col lg:flex-row gap-16 md:gap-24">
            {/* Side Navigation */}
            <aside className="hidden lg:block lg:w-48 sticky top-24 h-fit shrink-0 z-50">
              <div className="relative pl-8 border-l border-white/5 space-y-8">
                {/* Active Indicator Line */}
                <motion.div
                  className="absolute left-[-1px] w-[2px] bg-white z-10"
                  animate={{
                    y: activeArchiveId
                      ? activeCollections.findIndex((c) => c._id === activeArchiveId) * 52
                      : 0,
                    height: activeArchiveId ? 24 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                />

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-1 rounded-full bg-white opacity-20 animate-pulse" />
                    <span className="text-[9px] uppercase tracking-[0.4em] font-bold opacity-30">
                      Archive // V1.0
                    </span>
                  </div>

                  <div className="flex flex-col">
                    {activeCollections.map((col, idx) => (
                      <SidebarItem
                        key={col._id}
                        col={col}
                        idx={idx}
                        isActive={activeArchiveId === col._id}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-8 space-y-4">
                  <div className="space-y-2">
                    <span className="text-[7px] uppercase tracking-widest opacity-20 block font-mono">
                      Archive_Stream
                    </span>
                    <div className="w-full h-[1px] bg-white/5 relative overflow-hidden">
                      <motion.div
                        className="absolute top-0 left-0 h-full bg-white/40"
                        style={{ width: sidebarScrollWidth }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 opacity-20 font-mono text-[6px] uppercase tracking-widest leading-relaxed">
                    <div className="flex justify-between">
                      <span>Stability:</span>
                      <span>99%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sync_ID:</span>
                      <span className="text-white/60">OK</span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            {/* Exhibition Content */}
            <div className="flex-1 space-y-32 md:space-y-48">
              <div className="space-y-4 max-w-2xl">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="flex items-center gap-4 text-[9px] uppercase tracking-[0.6em] font-bold opacity-30"
                >
                  <div className="w-8 h-px bg-white/30" />
                  <span>Selected Works</span>
                </motion.div>
                <h2 className="text-4xl md:text-7xl font-serif italic tracking-tighter leading-tight">
                  Curating the world through a{' '}
                  <span className="opacity-50">distilled lens.</span>
                </h2>
              </div>

              <div className="space-y-32 md:space-y-64">
                {activeCollections.map((collection, index) => (
                  <ArchiveChapter
                    key={collection._id}
                    id={`archive-item-${collection._id}`}
                    collection={collection}
                    isActive={activeArchiveId === collection._id}
                    onClick={() => setSelectedCollection(collection)}
                    index={index}
                  />
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* ── Mobile Filmstrip Waterfall ── */}
        <div className="block md:hidden pb-12">
          {activeCollections.map((collection) => (
            <MobileFilmstripItem
              key={collection._id}
              collection={collection}
              onClick={() => setSelectedCollection(collection)}
            />
          ))}

          {/* Mobile Minimal Footer */}
          <footer className="pt-24 pb-12 px-6 flex flex-col items-center gap-6 text-center border-t border-white/5 opacity-50 mt-12">
            <span className="text-2xl font-serif italic tracking-tighter text-white">
              Visual Archive
            </span>
            <span className="text-[9px] uppercase tracking-[0.4em] font-mono whitespace-nowrap">
              &copy; {new Date().getFullYear()} Journal Gallery
            </span>
            <span className="text-[8px] uppercase tracking-[0.4em] font-mono opacity-50">
              Nikon Zf &middot; Astro + React &middot; Sanity CMS
            </span>
          </footer>
        </div>

        {/* ── Desktop Footer ── */}
        <footer className="hidden md:flex py-32 px-6 md:px-12 border-t border-white/5 flex-col md:flex-row justify-between items-center gap-16 text-[10px] uppercase tracking-[0.4em] opacity-30">
          <div className="flex flex-col items-center md:items-start gap-6">
            <div className="flex items-center gap-3 text-2xl font-serif italic tracking-tighter text-white">
              <Camera size={24} className="opacity-40" />
              <span>Journal Gallery</span>
            </div>
            <p className="max-w-xs text-center md:text-left leading-loose">
              Personal photographic archive · selected frames from across the United States.
            </p>
            <div className="text-[9px] uppercase tracking-[0.4em] opacity-40 mt-4">
              &copy; {new Date().getFullYear()} Journal Gallery
            </div>
          </div>
          <div className="flex gap-16">
            <div className="flex flex-col gap-4">
              <span className="opacity-100 font-bold mb-2">Channels</span>
              <a
                href="https://www.instagram.com/ryan_photoo/"
                target="_blank"
                rel="noopener noreferrer me"
                className="hover:text-white transition-colors"
              >
                Instagram
              </a>
              <a
                href="mailto:ryan2420159421@gmail.com"
                className="hover:text-white transition-colors"
              >
                Email
              </a>
            </div>
          </div>
        </footer>
      </div>

      {/* ── Collection detail overlay (MagazineLayout) ── */}
      <AnimatePresence>
        {selectedCollection && (
          <MagazineLayout
            collection={selectedCollection}
            allCollections={activeCollections}
            onSelectCollection={setSelectedCollection}
            onClose={() => setSelectedCollection(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
