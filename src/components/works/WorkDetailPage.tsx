import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ArrowRight } from 'lucide-react';
import type { Collection, Photo, PortableTextBlock } from '../../types';
import Lightbox from '../shared/Lightbox';
import { getMapboxToken } from '../../config/mapbox';

const expo = [0.16, 1, 0.3, 1] as const;
const editorial = [0.23, 1, 0.32, 1] as const;
const ACCENT = '#2c3e50';

interface Props {
  collection: Collection;
  photos: Photo[];
}

/* ─── Fallback editorial introductions ─── */
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
        <blockquote key={block._key} className="border-l-2 border-black/10 pl-4 my-4 italic opacity-60">
          {text}
        </blockquote>
      );
    }
    return (
      <p key={block._key} className="mb-4 last:mb-0">
        {text}
      </p>
    );
  });
}

function renderFallback(paragraphs: string[]): React.ReactNode {
  return paragraphs.map((p, i) => (
    <p key={i} className="mb-4 last:mb-0">{p}</p>
  ));
}

/* ─── Fixed editorial row rhythm ───
 * Mimics a physical magazine spread: full → halves → full → thirds, repeating.
 * Deliberately NOT aspect-ratio aware — the rhythm itself carries the page.
 */
type Span = 'full' | 'half' | 'third';
interface RowItem { photo: Photo; i: number; span: Span; }

const ROW_RHYTHM: ('full' | 'halves' | 'thirds')[] = ['full', 'halves', 'full', 'thirds'];

function buildRows(photos: Photo[]): RowItem[][] {
  const rows: RowItem[][] = [];
  let i = 0;
  let r = 0;
  while (i < photos.length) {
    const type = ROW_RHYTHM[r % ROW_RHYTHM.length];
    if (type === 'full') {
      rows.push([{ photo: photos[i], i, span: 'full' }]);
      i++;
    } else if (type === 'halves') {
      const row: RowItem[] = [];
      for (let k = 0; k < 2 && i < photos.length; k++, i++) {
        row.push({ photo: photos[i], i, span: 'half' });
      }
      rows.push(row);
    } else {
      const row: RowItem[] = [];
      for (let k = 0; k < 3 && i < photos.length; k++, i++) {
        row.push({ photo: photos[i], i, span: 'third' });
      }
      rows.push(row);
    }
    r++;
  }
  return rows;
}

/* Natural aspect ratio helper — falls back to span-based defaults when
 * photo dimensions are missing (e.g. legacy assets). */
function aspectOf(photo: Photo, span: Span): number {
  if (photo.width && photo.height) return photo.width / photo.height;
  return span === 'full' ? 16 / 9 : span === 'half' ? 4 / 5 : 3 / 4;
}

/* ═══════════════════════════════════════════════════════
 *  WorkDetailPage — High-End Photography Editorial Layout
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

  const firstPhoto = photos[0];
  void firstPhoto; // camera always shown as NIKON ZF per design spec

  return (
    <div className="min-h-screen bg-[#FDFDFB] text-[#1A1A1A]">

      {/* ── Top nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-30 px-6 md:px-12 py-4 flex items-center justify-between bg-[#FDFDFB]/85 backdrop-blur-2xl border-b border-black/5">
        <motion.a
          href="/"
          className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.4em] font-bold text-gray-400 overflow-hidden"
          whileHover="hovered"
          initial="idle"
        >
          <motion.div
            variants={{ idle: { x: 0, opacity: 0.5 }, hovered: { x: -3, opacity: 1 } }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            <ArrowRight size={14} className="rotate-180" />
          </motion.div>
          <motion.span
            variants={{ idle: { x: 0, opacity: 0.5, color: '#9CA3AF' }, hovered: { x: 2, opacity: 1, color: '#111827' } }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            Back
          </motion.span>
        </motion.a>
        <span className="text-[11px] uppercase tracking-[0.6em] font-bold opacity-30">
          {collection.location || collection.name}
        </span>
      </nav>

      {/* ── Magazine body: contained 12-col grid ── */}
      <div className="max-w-7xl mx-auto px-6 md:px-10 pt-[100px] md:pt-[140px] pb-20">
        <div className="grid lg:grid-cols-12 gap-10 md:gap-14">

          {/* ── 1. EDITORIAL SIDEBAR (col-span-4, sticky on desktop) ── */}
          <aside className="lg:col-span-4 lg:sticky lg:top-32 h-fit space-y-10 md:space-y-16">

            {/* Masthead */}
            <div className="space-y-5 md:space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-[10px] uppercase tracking-[0.6em] font-bold opacity-30">Vol. 01</span>
                <div className="h-px flex-1 bg-black/10" />
              </div>

              <motion.h1
                className="font-serif italic text-5xl md:text-6xl xl:text-7xl tracking-tighter leading-[0.85] md:leading-[0.8] text-[#1A1A1A]"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.9, ease: expo }}
              >
                {collection.name}
              </motion.h1>

              <div className="flex items-center gap-4 pt-2 md:pt-4">
                {collection.location && (
                  <p className="text-[10px] uppercase tracking-[0.4em] font-bold">{collection.location}</p>
                )}
                {collection.location && collection.year && (
                  <div className="w-1 h-1 rounded-full bg-black/20" />
                )}
                {collection.year && (
                  <p className="text-[10px] uppercase tracking-[0.4em] opacity-40 font-mono italic">{collection.year}</p>
                )}
              </div>
            </div>

            {/* Pull quote + equipment */}
            <motion.div
              className="space-y-6 md:space-y-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.9, ease: expo }}
            >
              {(hasIntro || fallbackParas || collection.subtitle) && (
                <div className="text-[15px] md:text-base lg:text-lg leading-[1.75] font-serif italic opacity-70">
                  <span className="text-4xl md:text-5xl float-left mr-2.5 mt-1 font-serif not-italic leading-none opacity-20 select-none">"</span>
                  {hasIntro
                    ? renderBlocks(collection.introduction!)
                    : fallbackParas
                      ? renderFallback(fallbackParas)
                      : <p>{collection.subtitle}</p>
                  }
                </div>
              )}

              <div className="pt-6 md:pt-8 border-t border-black/5">
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-widest font-bold opacity-30">Equipment</span>
                  <p className="text-[10px] uppercase tracking-widest font-medium">NIKON ZF</p>
                </div>
              </div>
            </motion.div>

            {/* Frame count */}
            <div className="hidden lg:block">
              <div className="flex items-center gap-6">
                <div className="w-12 h-px bg-black opacity-10" />
                <span className="text-[9px] uppercase tracking-[0.4em] font-mono opacity-30">
                  {photos.length} Captured Frames
                </span>
              </div>
            </div>

            {/* Mini-map — anchored to the masthead, not animated vertically */}
            {collectionLocation && mapboxToken && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.9, ease: expo }}
                className="hidden lg:block"
              >
                <motion.a
                  href={`/travel#loc=${collectionLocation.lat},${collectionLocation.lng},8`}
                  data-astro-prefetch
                  className="block relative overflow-hidden group"
                  whileHover="hovered"
                  initial="idle"
                  onMouseEnter={() => { import('mapbox-gl').catch(() => {}); }}
                >
                  <div className="relative h-32 overflow-hidden">
                    <motion.img
                      src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+2c3e50(${collectionLocation.lng},${collectionLocation.lat})/${collectionLocation.lng},${collectionLocation.lat},3,0/600x220@2x?access_token=${mapboxToken}`}
                      alt={`Map of ${collectionLocation.city || collection.name}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      draggable={false}
                      variants={{ idle: { scale: 1 }, hovered: { scale: 1.05 } }}
                      transition={{ duration: 0.9, ease: editorial }}
                    />
                  </div>
                  <div className="pt-3 flex items-center gap-3 border-t border-black/5 mt-3">
                    <MapPin size={11} style={{ color: ACCENT }} className="opacity-70" />
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <p className="text-[10px] uppercase tracking-widest font-bold truncate">
                        {collectionLocation.city || collection.name}
                      </p>
                      <span className="text-[9px] font-mono text-gray-400 ml-auto">
                        {Math.abs(collectionLocation.lat).toFixed(2)}°{collectionLocation.lat >= 0 ? 'N' : 'S'}
                      </span>
                    </div>
                  </div>
                </motion.a>
              </motion.div>
            )}
          </aside>

          {/* ── 2. DYNAMIC PHOTO GRID (col-span-8) ── */}
          <div className="lg:col-span-8 space-y-1 md:space-y-[2px]">

            {buildRows(photos).map((row, rowIdx) => {
              const ars = row.map(({ photo, span }) => aspectOf(photo, span));
              const sumAR = ars.reduce((a, b) => a + b, 0);
              return (
                <div key={rowIdx} className="flex gap-1 md:gap-[2px]">
                  {row.map(({ photo, i, span }, cellIdx) => (
                    <PhotoCell
                      key={photo._id}
                      photo={photo}
                      collection={collection}
                      i={i}
                      span={span}
                      ar={ars[cellIdx]}
                      widthPct={100 * ars[cellIdx] / sumAR}
                      isHovered={hoveredIndex === i}
                      onHover={setHoveredIndex}
                      onClick={setLightboxIndex}
                    />
                  ))}
                </div>
              );
            })}

            {/* Back to top */}
            <footer className="pt-32 pb-12 text-center border-t border-black/5 mt-16">
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="group flex flex-col items-center gap-4 mx-auto"
              >
                <div className="w-12 h-12 rounded-full border border-black/10 flex items-center justify-center group-hover:bg-[#1A1A1A] group-hover:border-transparent group-hover:text-white transition-all duration-500">
                  <ArrowRight className="-rotate-90" size={16} />
                </div>
                <span className="text-[10px] uppercase tracking-[0.4em] font-bold opacity-30 group-hover:opacity-100 transition-opacity">
                  Back to Top
                </span>
              </button>
            </footer>
          </div>
        </div>
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

/* ─── Single photo cell ─── */
function PhotoCell({
  photo, collection, i, span, ar, widthPct, isHovered, onHover, onClick
}: {
  photo: Photo; collection: Collection; i: number; span: Span; ar: number; widthPct: number;
  isHovered: boolean; onHover: (i: number | null) => void; onClick: (i: number) => void;
}) {
  void span;
  // Justified-gallery row math: widths are proportional to aspect ratios so
  // every cell in a row ends up the same height — no cropping, no ragged bottoms.
  return (
    <motion.div
      id={`photo-${photo._id}`}
      className="relative overflow-hidden cursor-pointer bg-[#F3F2EF] work-photo-item min-w-0"
      style={{ flex: `${widthPct} 0 0`, aspectRatio: ar }}
      data-location={photo.title || photo.location?.city || collection.name}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.2, ease: editorial, delay: (i % 3) * 0.1 }}
      onHoverStart={() => onHover(i)}
      onHoverEnd={() => onHover(null)}
      onClick={() => onClick(i)}
    >
      <motion.img
        src={`${photo.imageUrl}?auto=format&w=1200&q=85`}
        srcSet={`${photo.imageUrl}?auto=format&w=600&q=85 600w, ${photo.imageUrl}?auto=format&w=1200&q=85 1200w, ${photo.imageUrl}?auto=format&w=1800&q=82 1800w`}
        sizes="(min-width: 1024px) 50vw, 100vw"
        alt={photo.title || collection.name}
        className="absolute inset-0 w-full h-full object-cover grayscale-[0.1] hover:grayscale-0 transition-[filter] duration-1000"
        loading={i < 4 ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        animate={{ scale: isHovered ? 1.03 : 1 }}
        transition={{ duration: 1.5, ease: editorial }}
      />

      <AnimatePresence>
        {isHovered && (photo.title || photo.aperture) && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 px-3 py-2.5 bg-gradient-to-t from-black/55 to-transparent pointer-events-none"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
          >
            {photo.title && (
              <p className="text-white/95 text-[11px] font-light truncate leading-tight">{photo.title}</p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5 text-white/60 text-[9px] font-mono">
              {photo.focalLength && <span>{photo.focalLength}</span>}
              {photo.aperture && <><span>·</span><span>{photo.aperture}</span></>}
              {photo.shutterSpeed && <><span>·</span><span>{photo.shutterSpeed}</span></>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
