import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin } from 'lucide-react';
import type { Collection, Photo, PortableTextBlock } from '../../types';
import Lightbox from '../shared/Lightbox';
import { getMapboxToken } from '../../config/mapbox';

const expo = [0.16, 1, 0.3, 1] as const;
const ACCENT = '#2c3e50';

interface Props {
  collection: Collection;
  photos: Photo[];
}

/* ─── Fallback editorial introductions (shown if Sanity field is empty) ─── */
const EDITORIAL_FALLBACKS: Record<string, string[]> = {
  'new-york-stories': [
    'Manhattan light arrives sideways in the early hours, cutting between towers in long amber slabs that catch the steam rising from grates and the grime on fire escapes. By mid-morning the city is already hard-edged, every surface asserting itself.',
    'Dusk compresses the borough into silhouette: water towers against violet sky, headlights smearing the wet street into something almost painterly. There is no softness here, only different kinds of contrast.',
  ],
  'page': [
    'Inside Antelope Canyon the sandstone narrows until sound itself seems muffled. The walls have been smoothed by centuries of flash floods into curves that read more like fabric than rock — ochre folding into deep burgundy wherever a shaft of noon light finds the floor.',
    'That light lasts minutes. It enters as a column, diffuse at the edges, and illuminates suspended dust so finely that the air appears solid. What remains is pure geological time rendered in color.',
  ],
  'zion-national-park': [
    'The Virgin River runs cold and milky green through the canyon bottom, its sound constant and indifferent to the walls rising nearly a thousand meters on either side. In morning shadow the sandstone is the color of dried blood; by noon it goes copper.',
    'What Zion enforces is a reckoning with scale. A single wall of Navajo sandstone erases the horizon and replaces it with texture — cross-bedded strata reading like handwriting from some earlier world.',
  ],
  'arizona': [
    'The Sonoran at midday offers almost nothing to hide behind. Saguaro cast shadows barely wider than a hand, and the sky is so bleached it reads white rather than blue. The silence here has weight — oppressive to some, clarifying to others.',
    'Dawn is the negotiation: the moment when the land is still cool and the light has not yet gone harsh, when long shadows of rock formations stretch west and the desert floor shows all its texture.',
  ],
  'orlando': [
    'Florida afternoon light is relentless and democratic — it flattens shadows, bleaches signage, and turns every surface equally bright. In the parks it catches the spray of fountains in small prismatic bursts, indifferent to anything beneath it.',
    'Away from the spectacle, Orlando is a city of retention ponds and palm trees bending in afternoon thunderstorm wind while the pavement still steams. The transition between the engineered and the accidental happens fast here.',
  ],
  'bryce-canyon-national-park': [
    'The hoodoos at Bryce form a kind of frozen congregation — thousands of pink limestone spires standing close together, the tallest capped with harder dolomite that protected them while everything around eroded away. In fresh snow they are almost surreal.',
    'Sunrise on the rim produces the most compressed range of tone — deep blue shadow filling the canyon floor, the spires above catching first light in amber and rust, the sky at the horizon going briefly gold before the whole amphitheater normalizes.',
  ],
  'miami': [
    'Ocean Drive at dusk exists in two registers simultaneously: the pastel geometry of Art Deco facades going soft in the last natural light, and the neon beginning its slow assertion against the darkening sky. The sidewalk retains the day\'s heat long after the sun has gone.',
    'South Beach operates on a logic of surfaces — the gloss of a rental car hood, reflections in hotel lobby glass, the particular turquoise of the Atlantic at noon when the sand below is still visible and the water seems lit from within.',
  ],
};

/* ─── Portable Text renderer ─── */
function renderBlocks(blocks: PortableTextBlock[]): React.ReactNode {
  return blocks.map((block) => {
    const text = block.children.map((span) => {
      let node: React.ReactNode = span.text;
      if (span.marks?.includes('em')) node = <em key={span._key}>{node}</em>;
      if (span.marks?.includes('strong')) node = <strong key={span._key}>{node}</strong>;
      return node;
    });
    if (block.style === 'blockquote') {
      return (
        <blockquote key={block._key} className="border-l-2 border-gray-200 pl-4 my-4 text-gray-400 italic font-light text-[14px] leading-relaxed">
          {text}
        </blockquote>
      );
    }
    return (
      <p key={block._key} className="text-gray-500 font-light text-[14px] leading-[1.85] mb-3 last:mb-0">
        {text}
      </p>
    );
  });
}

function renderFallback(paragraphs: string[]): React.ReactNode {
  return paragraphs.map((p, i) => (
    <p key={i} className="text-gray-500 font-light text-[14px] leading-[1.85] mb-3 last:mb-0">{p}</p>
  ));
}

/* ─── Magazine photo layout ───
 * Vertical grid: photos are distributed across 3 columns with
 * editorial sizing — some span full width, some are medium, some small.
 * The pattern creates breathing room without feeling random.
 */
type ColSpan = 'full' | 'two-thirds' | 'one-third';

interface PhotoLayout {
  col: string;     // Tailwind col-span
  aspect: string;  // Tailwind aspect-ratio
}

function getLayout(index: number): PhotoLayout {
  // Repeating 6-photo editorial pattern
  const patterns: PhotoLayout[] = [
    { col: 'col-span-2', aspect: 'aspect-[3/2]' },      // 0: wide, short
    { col: 'col-span-1', aspect: 'aspect-[2/3]' },      // 1: narrow, tall
    { col: 'col-span-1', aspect: 'aspect-[3/4]' },      // 2: narrow, portrait
    { col: 'col-span-2', aspect: 'aspect-[4/3]' },      // 3: wide, landscape
    { col: 'col-span-1', aspect: 'aspect-[3/4]' },      // 4: narrow, portrait
    { col: 'col-span-1', aspect: 'aspect-[2/3]' },      // 5: narrow, tall
  ];
  return patterns[index % patterns.length];
}

/* ═══════════════════════════════════════════════════════
 *  WorkDetailPage
 * ═══════════════════════════════════════════════════════ */
export default function WorkDetailPage({ collection, photos }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const collectionLocation = useMemo(() => {
    const photo = photos.find(p => p.location?.lat != null && p.location?.lng != null);
    return photo?.location ?? null;
  }, [photos]);

  const mapboxToken = useMemo(() => {
    try { return getMapboxToken(); } catch { return ''; }
  }, []);

  const hasIntro = collection.introduction && collection.introduction.length > 0;
  const fallbackParas = EDITORIAL_FALLBACKS[collection.slug] ?? null;

  return (
    <div className="min-h-screen bg-white">

      {/* ── Top nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-30 px-6 md:px-12 py-4 flex items-center justify-between bg-white/85 backdrop-blur-xl border-b border-gray-100/60">
        <a href="/" className="font-serif italic text-sm text-gray-400 hover:text-gray-900 transition-colors duration-300">
          &larr; Ryan Xu.
        </a>
        <span className="text-[10px] font-mono text-gray-300 tracking-wider uppercase">
          {collection.name} &middot; {photos.length}
        </span>
      </nav>

      {/* ── Page body: sidebar + content ── */}
      <div className="flex min-h-screen pt-[57px]">

        {/* ── LEFT SIDEBAR (desktop) ── */}
        <aside className="hidden lg:flex flex-col w-[300px] xl:w-[340px] shrink-0 px-8 xl:px-10 border-r border-gray-100/60 overflow-y-auto sticky top-[57px] h-[calc(100vh-57px)]">
          <div className="py-10 flex flex-col gap-0">
            {/* Name */}
            <motion.h1
              className="font-serif italic text-4xl xl:text-5xl text-gray-900 tracking-tight leading-[0.92]"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, ease: expo }}
            >
              {collection.name}
            </motion.h1>

            {/* Meta */}
            <motion.div
              className="flex items-center gap-2.5 mt-4 text-[9px] font-mono text-gray-300 tracking-wider uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              {collection.year && <span>{collection.year}</span>}
              {collection.location && <><span className="text-gray-200">·</span><span>{collection.location}</span></>}
            </motion.div>

            {/* Divider */}
            <motion.div
              className="w-7 h-px bg-gray-200 mt-6 mb-6"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.4, duration: 0.7, ease: expo }}
              style={{ transformOrigin: 'left' }}
            />

            {/* Editorial text */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8, ease: expo }}
            >
              {hasIntro
                ? renderBlocks(collection.introduction!)
                : fallbackParas
                  ? renderFallback(fallbackParas)
                  : collection.subtitle
                    ? <p className="text-gray-500 font-light text-[14px] leading-[1.85]">{collection.subtitle}</p>
                    : null
              }
            </motion.div>

            {/* Frame count */}
            <motion.p
              className="mt-7 text-[9px] font-mono text-gray-300 tracking-widest uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.5 }}
            >
              {photos.length} frames
            </motion.p>

            {/* ── Mini-map ── */}
            {collectionLocation && mapboxToken && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.8, ease: expo }}
                className="mt-8 rounded-xl overflow-hidden border border-gray-100 shadow-sm"
              >
                <a
                  href={`/travel#loc=${collectionLocation.lat},${collectionLocation.lng},8`}
                  className="block relative h-36 overflow-hidden group"
                >
                  <img
                    src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+2c3e50(${collectionLocation.lng},${collectionLocation.lat})/${collectionLocation.lng},${collectionLocation.lat},3,0/480x220@2x?access_token=${mapboxToken}`}
                    alt={`Map of ${collectionLocation.city || collection.name}`}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/30 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-400">
                    <span className="text-white text-[9px] uppercase tracking-[0.2em] font-bold bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
                      View on map
                    </span>
                  </div>
                </a>
                <div className="px-3.5 py-3 bg-white flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${ACCENT}12` }}>
                    <MapPin size={12} style={{ color: ACCENT }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-gray-900 truncate">{collectionLocation.city || collection.name}</p>
                    <p className="text-[9px] font-mono text-gray-400">
                      {Math.abs(collectionLocation.lat).toFixed(3)}°{collectionLocation.lat >= 0 ? 'N' : 'S'}&nbsp;
                      {Math.abs(collectionLocation.lng).toFixed(3)}°{collectionLocation.lng >= 0 ? 'E' : 'W'}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </aside>

        {/* ── RIGHT: photo grid ── */}
        <main className="flex-1 overflow-y-auto">

          {/* Mobile header */}
          <div className="lg:hidden sticky top-[57px] z-20 bg-white/95 backdrop-blur-xl px-5 py-3 border-b border-gray-100/60">
            <h1 className="font-serif italic text-xl text-gray-900 tracking-tight">{collection.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 text-[9px] font-mono text-gray-300 tracking-wider uppercase">
              {collection.year && <span>{collection.year}</span>}
              {collection.location && <><span>·</span><span>{collection.location}</span></>}
              <span>·</span><span>{photos.length} frames</span>
            </div>
          </div>

          {/* ── Magazine grid ── */}
          <div className="grid grid-cols-3 gap-[3px] p-[3px]">
            {photos.map((photo, i) => {
              const layout = getLayout(i);
              const isHovered = hoveredIndex === i;

              return (
                <motion.div
                  key={photo._id}
                  id={`photo-${photo._id}`}
                  className={`${layout.col} ${layout.aspect} overflow-hidden relative cursor-pointer bg-gray-50`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: Math.min(i * 0.04, 0.5) }}
                  onHoverStart={() => setHoveredIndex(i)}
                  onHoverEnd={() => setHoveredIndex(null)}
                  onClick={() => setLightboxIndex(i)}
                >
                  <motion.img
                    src={`${photo.imageUrl}?auto=format&w=1000&q=85`}
                    alt={photo.title || collection.name}
                    className="w-full h-full object-cover"
                    style={i === 0 ? { viewTransitionName: `cover-${collection.slug}` } : undefined}
                    loading={i < 4 ? 'eager' : 'lazy'}
                    decoding="async"
                    draggable={false}
                    animate={{
                      scale: isHovered ? 1.05 : 1,
                    }}
                    transition={{
                      scale: { type: 'spring', stiffness: 180, damping: 28, mass: 0.8 },
                    }}
                  />

                  {/* Hover caption overlay */}
                  <AnimatePresence>
                    {isHovered && (photo.title || photo.aperture) && (
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 px-3 py-2.5 bg-gradient-to-t from-black/60 to-transparent"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.2 }}
                      >
                        {photo.title && (
                          <p className="text-white/90 text-[11px] font-light truncate leading-tight">{photo.title}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5 text-white/50 text-[9px] font-mono">
                          {photo.focalLength && <span>{photo.focalLength}</span>}
                          {photo.aperture && <><span>·</span><span>{photo.aperture}</span></>}
                          {photo.shutterSpeed && <><span>·</span><span>{photo.shutterSpeed}</span></>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {/* Bottom padding */}
          <div className="h-16" />
        </main>
      </div>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox photos={photos} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
