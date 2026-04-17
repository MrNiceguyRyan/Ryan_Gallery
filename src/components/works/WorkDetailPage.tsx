import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ArrowRight } from 'lucide-react';
import type { Collection, Photo, PortableTextBlock } from '../../types';
import Lightbox from '../shared/Lightbox';
import { getMapboxToken } from '../../config/mapbox';

const expo = [0.16, 1, 0.3, 1] as const;
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
        <blockquote key={block._key} className="border-l-2 border-gray-200 pl-4 my-4 text-gray-400 italic font-light text-[14px] leading-relaxed">
          {text}
        </blockquote>
      );
    }
    return (
      <p key={block._key} className="text-gray-500 font-light text-[14px] leading-[1.9] mb-3 last:mb-0">
        {text}
      </p>
    );
  });
}

function renderFallback(paragraphs: string[]): React.ReactNode {
  return paragraphs.map((p, i) => (
    <p key={i} className="text-gray-500 font-light text-[14px] leading-[1.9] mb-3 last:mb-0">{p}</p>
  ));
}

const CATEGORY_LABELS: Record<string, string> = {
  landscape: 'City Landscape',
  street: 'Street Photo',
  portrait: 'Portrait Study',
  architecture: 'Architecture',
  abstract: 'Abstract',
  uncategorized: 'Curated Selection',
};

interface SubCategory {
  id: string;
  title: string;
  count: number;
}

function toChapterTitle(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSubCategories(photos: Photo[]): SubCategory[] {
  const order: string[] = [];
  const counter = new Map<string, number>();

  photos.forEach((photo) => {
    const key = (photo.styleCategory || 'uncategorized').toLowerCase();
    if (!counter.has(key)) order.push(key);
    counter.set(key, (counter.get(key) ?? 0) + 1);
  });

  return order.map((id) => ({
    id,
    title: CATEGORY_LABELS[id] ?? toChapterTitle(id),
    count: counter.get(id) ?? 0,
  }));
}

/* ─── 6-column magazine photo layout ─── */
type Span = 'full' | 'half' | 'third';

interface PhotoLayout { span: Span; }

function getLayout(index: number): PhotoLayout {
  // Reference pattern from MagazineLayout: 0=full, 1-2=half/half, 3=full, 4-5-6=third/third/third
  const patterns: Span[] = ['full', 'half', 'half', 'full', 'third', 'third', 'third'];
  return { span: patterns[index % patterns.length] };
}

function colClass(span: Span) {
  if (span === 'full')  return 'col-span-6';
  if (span === 'half')  return 'col-span-3';
  return 'col-span-2';
}

function aspectClass(span: Span, index: number) {
  if (span === 'full')  return 'aspect-[16/7]';
  if (span === 'half')  return index % 2 === 0 ? 'aspect-[4/5]' : 'aspect-[4/5]';
  return 'aspect-[3/4]';
}

/* ─── Smart row builder based on actual photo aspect ratios ───
 * landscape (w > h * 1.2) → full-width row alone
 * portrait (h > w * 1.1) → pair two portraits side by side (half each)
 *   if only one portrait remains → full-width
 * square-ish → group 3 together (third each), or pair with portrait
 */
function isLandscape(p: Photo) {
  if (!p.width || !p.height) return false;
  return p.width / p.height > 1.2;
}
function isPortrait(p: Photo) {
  if (!p.width || !p.height) return true; // default assume portrait
  return p.height / p.width > 1.1;
}

interface RowItem { photo: Photo; i: number; span: Span; }

function buildRows(photos: Photo[]): RowItem[][] {
  const rows: RowItem[][] = [];
  let i = 0;
  while (i < photos.length) {
    const p = photos[i];
    if (isLandscape(p)) {
      // Landscape alone: full width
      rows.push([{ photo: p, i, span: 'full' }]);
      i++;
    } else if (isPortrait(p)) {
      // Portrait: try to pair with next portrait
      const next = photos[i + 1];
      if (next && isPortrait(next)) {
        rows.push([
          { photo: p,    i,   span: 'half' },
          { photo: next, i: i+1, span: 'half' },
        ]);
        i += 2;
      } else if (next && !isLandscape(next)) {
        // Next is square-ish: pair as half
        rows.push([
          { photo: p,    i,   span: 'half' },
          { photo: next, i: i+1, span: 'half' },
        ]);
        i += 2;
      } else {
        // Portrait alone: full width
        rows.push([{ photo: p, i, span: 'full' }]);
        i++;
      }
    } else {
      // Square-ish: group 3 as thirds, or 2 as half, or alone as full
      const p2 = photos[i + 1];
      const p3 = photos[i + 2];
      if (p2 && !isLandscape(p2) && p3 && !isLandscape(p3)) {
        rows.push([
          { photo: p,  i,   span: 'third' },
          { photo: p2, i: i+1, span: 'third' },
          { photo: p3, i: i+2, span: 'third' },
        ]);
        i += 3;
      } else if (p2 && !isLandscape(p2)) {
        rows.push([
          { photo: p,  i,   span: 'half' },
          { photo: p2, i: i+1, span: 'half' },
        ]);
        i += 2;
      } else {
        rows.push([{ photo: p, i, span: 'full' }]);
        i++;
      }
    }
  }
  return rows;
}

/* ═══════════════════════════════════════════════════════
 *  WorkDetailPage
 * ═══════════════════════════════════════════════════════ */
export default function WorkDetailPage({ collection, photos }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all');

  const collectionLocation = useMemo(() => {
    const photo = photos.find(p => p.location?.lat != null && p.location?.lng != null);
    return photo?.location ?? null;
  }, [photos]);

  const mapboxToken = useMemo(() => {
    try { return getMapboxToken(); } catch { return ''; }
  }, []);

  const subCategories = useMemo(() => buildSubCategories(photos), [photos]);
  const displayedPhotos = useMemo(() => {
    if (activeCategoryId === 'all') return photos;
    return photos.filter((photo) => (photo.styleCategory || 'uncategorized').toLowerCase() === activeCategoryId);
  }, [photos, activeCategoryId]);

  const hasIntro = collection.introduction && collection.introduction.length > 0;
  const fallbackParas = EDITORIAL_FALLBACKS[collection.slug] ?? null;

  // Get camera info from first photo
  const firstPhoto = photos[0];
  const camera = firstPhoto?.camera;
  const focalLength = firstPhoto?.focalLength;

  useEffect(() => {
    if (activeCategoryId === 'all') return;
    if (subCategories.some((cat) => cat.id === activeCategoryId)) return;
    setActiveCategoryId('all');
  }, [subCategories, activeCategoryId]);

  useEffect(() => {
    setHoveredIndex(null);
    setLightboxIndex(null);
  }, [activeCategoryId]);

  return (
    <div className="relative min-h-screen bg-[#FDFDFB] text-[#1A1A1A]">
      <div
        className="paper-grain pointer-events-none fixed inset-0 z-0 opacity-[0.032] mix-blend-multiply"
        aria-hidden
      />

      {/* ── Top nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-30 px-6 md:px-12 py-4 flex items-center justify-between bg-white/80 backdrop-blur-2xl border-b border-black/5">
        <motion.a
          href="/"
          className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.4em] font-bold text-gray-400 overflow-hidden"
          whileHover="hovered"
          initial="idle"
        >
          <motion.div
            variants={{
              idle:    { x: 0,  opacity: 0.5 },
              hovered: { x: -3, opacity: 1   },
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            <ArrowRight size={14} className="rotate-180" />
          </motion.div>
          <motion.span
            variants={{
              idle:    { x: 0, opacity: 0.5, color: '#9CA3AF' },
              hovered: { x: 2, opacity: 1,   color: '#111827' },
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            Back
          </motion.span>
        </motion.a>
        <span className="text-[11px] uppercase tracking-[0.6em] font-bold opacity-30">
          {collection.location || collection.name}
        </span>
      </nav>

      {/* ── Page body: sidebar + content ── */}
      <div className="relative z-[1] flex min-h-screen pt-[57px]">

        {/* ── LEFT SIDEBAR (desktop) ── */}
        <aside className="hidden lg:flex flex-col w-[320px] xl:w-[360px] shrink-0 px-8 xl:px-12 border-r border-black/5 self-start sticky top-[57px] max-h-[calc(100vh-57px)] overflow-y-auto">
          <div className="py-12 flex flex-col gap-0">

            {/* Vol. label */}
            <motion.div
              className="flex items-center gap-4 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <span className="text-[9px] uppercase tracking-[0.6em] font-bold opacity-30">Vol. 01</span>
              <div className="h-px flex-1 bg-black/10" />
            </motion.div>

            {/* Title — large italic */}
            <motion.h1
              className="font-serif italic text-6xl xl:text-7xl text-gray-900 tracking-tighter leading-[0.85]"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, ease: expo }}
            >
              {collection.name}
            </motion.h1>

            {/* Meta */}
            <motion.div
              className="flex items-center gap-3 mt-5 text-[10px] uppercase tracking-[0.4em] font-bold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              {collection.location && <span>{collection.location}</span>}
              {collection.location && collection.year && <span className="w-1 h-1 rounded-full bg-black/20 inline-block" />}
              {collection.year && <span className="opacity-40 font-mono italic">{collection.year}</span>}
            </motion.div>

            {/* Editorial TOC — indexed vertical chapter nav */}
            {subCategories.length > 0 && (
              <motion.div
                className="space-y-6 pb-12 mt-10 border-b border-black/5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.65, ease: expo }}
              >
                <div className="flex items-center gap-4">
                  <span className="text-[9px] uppercase tracking-[0.4em] font-bold opacity-30">Selection</span>
                  <div className="h-[1px] flex-1 bg-black/5" />
                </div>

                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => setActiveCategoryId('all')}
                    className="group flex items-center gap-6 text-left"
                  >
                    <span className={`text-[9px] font-mono transition-all duration-500 ${activeCategoryId === 'all' ? 'opacity-100' : 'opacity-20 group-hover:opacity-40'}`}>
                      00
                    </span>
                    <div className="relative flex flex-col">
                      <span className={`text-[10px] uppercase tracking-[0.3em] font-bold transition-all duration-500 ${
                        activeCategoryId === 'all' ? 'opacity-100 translate-x-3' : 'opacity-20 group-hover:opacity-50 group-hover:translate-x-1'
                      }`}>
                        The Archive
                      </span>
                      {activeCategoryId === 'all' && (
                        <motion.div
                          layoutId="activeChapterBar"
                          className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-[1px] bg-black"
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                      )}
                    </div>
                  </button>

                  {subCategories.map((cat, idx) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategoryId(cat.id)}
                      className="group flex items-center gap-6 text-left"
                    >
                      <span className={`text-[9px] font-mono transition-all duration-500 ${
                        activeCategoryId === cat.id ? 'opacity-100' : 'opacity-20 group-hover:opacity-40'
                      }`}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="relative flex flex-col">
                        <span className={`text-[10px] uppercase tracking-[0.3em] font-bold transition-all duration-500 ${
                          activeCategoryId === cat.id ? 'opacity-100 translate-x-3' : 'opacity-20 group-hover:opacity-50 group-hover:translate-x-1'
                        }`}>
                          {cat.title}
                        </span>
                        {activeCategoryId === cat.id && (
                          <motion.div
                            layoutId="activeChapterBar"
                            className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-[1px] bg-black"
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Editorial text with large opening quote */}
            <motion.div
              className="mt-8"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8, ease: expo }}
            >
              {(collection.descriptionCN || collection.descriptionEN) ? (
                <div className="space-y-6">
                  {collection.descriptionCN && (
                    <p className="text-[15px] leading-[1.9] font-sans opacity-80">
                      {collection.descriptionCN}
                    </p>
                  )}
                  {collection.descriptionEN && (
                    <p className="text-sm leading-relaxed font-serif italic opacity-40 border-l border-black/10 pl-4">
                      {collection.descriptionEN}
                    </p>
                  )}
                </div>
              ) : (hasIntro || fallbackParas || collection.subtitle) ? (
                <div className="relative">
                  <span className="text-6xl float-left mr-2 mt-1 font-serif not-italic leading-none opacity-10 select-none">"</span>
                  <div className="text-[15px] leading-[1.9] font-serif italic opacity-70">
                    {hasIntro
                      ? renderBlocks(collection.introduction!)
                      : fallbackParas
                        ? renderFallback(fallbackParas)
                        : <p>{collection.subtitle}</p>
                    }
                  </div>
                </div>
              ) : null}
            </motion.div>

            {/* Camera / lens info */}
            {(camera || focalLength) && (
              <motion.div
                className="mt-8 pt-8 border-t border-black/5 grid grid-cols-2 gap-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.5 }}
              >
                {camera && (
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase tracking-widest font-bold opacity-30">Shot on</span>
                    <p className="text-[10px] uppercase tracking-widest font-medium">{camera}</p>
                  </div>
                )}
                {focalLength && (
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase tracking-widest font-bold opacity-30">Lens</span>
                    <p className="text-[10px] uppercase tracking-widest font-medium">{focalLength}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Frame count */}
            <motion.div
              className="mt-8 flex items-center gap-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.5 }}
            >
              <div className="w-10 h-px bg-black opacity-10" />
              <span className="text-[9px] uppercase tracking-[0.4em] font-mono opacity-30">
                {displayedPhotos.length}{activeCategoryId !== 'all' ? ` / ${photos.length}` : ''} Captured Frames
              </span>
            </motion.div>

            {/* ── Mini-map ── */}
            {collectionLocation && mapboxToken && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.8, ease: expo }}
                className="mt-8 rounded-xl overflow-hidden border border-black/6 shadow-sm"
              >
                <motion.a
                  href={`/travel#loc=${collectionLocation.lat},${collectionLocation.lng},8`}
                  className="block relative h-36 overflow-hidden"
                  whileHover="hovered"
                  initial="idle"
                >
                  <motion.img
                    src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+2c3e50(${collectionLocation.lng},${collectionLocation.lat})/${collectionLocation.lng},${collectionLocation.lat},3,0/480x220@2x?access_token=${mapboxToken}`}
                    alt={`Map of ${collectionLocation.city || collection.name}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    draggable={false}
                    variants={{ idle: { scale: 1 }, hovered: { scale: 1.06 } }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/25 to-transparent" />
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    variants={{ idle: { opacity: 0 }, hovered: { opacity: 1 } }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="text-white text-[9px] uppercase tracking-[0.2em] font-bold bg-black/35 backdrop-blur-sm px-3 py-1.5 rounded-full">
                      View on map
                    </span>
                  </motion.div>
                </motion.a>
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
        <main className="flex-1">

          {/* Mobile header */}
          <div className="lg:hidden sticky top-[57px] z-20 bg-white/95 backdrop-blur-xl px-5 py-3 border-b border-black/5">
            <h1 className="font-serif italic text-xl text-gray-900 tracking-tight">{collection.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 text-[9px] font-mono text-gray-400 tracking-wider uppercase">
              {collection.year && <span>{collection.year}</span>}
              {collection.location && <><span>·</span><span>{collection.location}</span></>}
              <span>·</span><span>{displayedPhotos.length}{activeCategoryId !== 'all' ? ` / ${photos.length}` : ''} frames</span>
            </div>
            {subCategories.length > 0 && (
              <div className="mt-3 -mx-1 relative">
                <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white/95 to-transparent z-[1]" />
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white/95 to-transparent z-[1]" />
                <div className="overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth">
                  <div className="flex items-center gap-4 min-w-max px-1">
                  <button
                    onClick={() => setActiveCategoryId('all')}
                    className="relative pb-1 text-left snap-start"
                  >
                    <span className={`text-[9px] uppercase tracking-[0.28em] font-bold transition-all duration-500 ${
                      activeCategoryId === 'all' ? 'opacity-100' : 'opacity-25'
                    }`}>
                      00 THE ARCHIVE
                    </span>
                    {activeCategoryId === 'all' && (
                      <motion.div
                        layoutId="workMobileChapterBar"
                        className="absolute left-0 right-0 -bottom-[1px] h-[1px] bg-black/70"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                  </button>
                  {subCategories.map((cat, idx) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategoryId(cat.id)}
                      className="relative pb-1 text-left snap-start"
                    >
                      <span className={`text-[9px] uppercase tracking-[0.28em] font-bold transition-all duration-500 ${
                        activeCategoryId === cat.id ? 'opacity-100' : 'opacity-25'
                      }`}>
                        {String(idx + 1).padStart(2, '0')} {cat.title}
                      </span>
                      {activeCategoryId === cat.id && (
                        <motion.div
                          layoutId="workMobileChapterBar"
                          className="absolute left-0 right-0 -bottom-[1px] h-[1px] bg-black/70"
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                      )}
                    </button>
                  ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Smart magazine grid based on photo aspect ratios ── */}
          <div className="space-y-[3px] p-[3px]">
            {buildRows(displayedPhotos).map((row, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-6 gap-[3px]">
                {row.map(({ photo, i, span }) => (
                  <PhotoCell
                    key={photo._id}
                    photo={photo}
                    collection={collection}
                    i={i}
                    span={span}
                    hoveredIndex={hoveredIndex}
                    onHover={setHoveredIndex}
                    onClick={setLightboxIndex}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* ── Back to top footer ── */}
          <footer className="pt-24 pb-16 text-center border-t border-black/5 mt-2">
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

        </main>
      </div>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox photos={displayedPhotos} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Single photo cell ─── */
function photoHasEditorialCaption(photo: Photo) {
  return !!(
    photo.title ||
    photo.focalLength ||
    photo.aperture ||
    photo.shutterSpeed ||
    photo.iso ||
    photo.camera
  );
}

function PhotoCell({
  photo, collection, i, span, hoveredIndex, onHover, onClick
}: {
  photo: Photo; collection: Collection; i: number; span: Span;
  hoveredIndex: number | null; onHover: (i: number | null) => void; onClick: (i: number) => void;
}) {
  const isHovered = hoveredIndex === i;
  const isPeerFocused = hoveredIndex !== null && hoveredIndex !== i;

  // Compute aspect ratio via paddingTop trick (100% * h/w) — no Tailwind dynamic class needed
  const ratio = photo.width && photo.height ? photo.height / photo.width : null;
  const paddingTop = ratio
    ? `${(ratio * 100).toFixed(2)}%`
    : span === 'full' ? '56.25%'  // 16/9 fallback
    : span === 'half' ? '125%'    // 4/5 fallback
    : '133.33%';                  // 3/4 fallback

  return (
    <motion.div
      id={`photo-${photo._id}`}
      className={`${colClass(span)} group overflow-hidden relative cursor-pointer bg-gray-100 work-photo-item`}
      style={{ paddingTop }}
      data-location={photo.title || photo.location?.city || collection.name}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-5%' }}
      transition={{ duration: 0.6, delay: Math.min(i * 0.04, 0.4) }}
      onHoverStart={() => onHover(i)}
      onHoverEnd={() => onHover(null)}
      onClick={() => onClick(i)}
    >
      <motion.div
        className="absolute inset-0 overflow-hidden"
        animate={{
          opacity: isPeerFocused ? 0.48 : 1,
          filter: isPeerFocused ? 'blur(2px)' : 'blur(0px)',
        }}
        transition={{ duration: 0.42, ease: expo }}
      >
        <div
          className="pointer-events-none absolute top-3 right-3 z-20 rounded-sm bg-black/40 px-1.5 py-0.5 text-[8px] font-mono tracking-[0.18em] text-white/90 opacity-[0.35] backdrop-blur-[2px] transition-opacity duration-700 group-hover:opacity-100"
          aria-hidden
        >
          NO. {String(i + 1).padStart(2, '0')}
        </div>
        <motion.img
          src={`${photo.imageUrl}?auto=format&w=1200&q=85`}
          alt={photo.title || collection.name}
          className="w-full h-full object-cover grayscale-[0.15] hover:grayscale-0 transition-none"
          style={i === 0 ? { viewTransitionName: `cover-${collection.slug}` } : undefined}
          loading={i < 4 ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          animate={{ scale: isHovered ? 1.04 : 1 }}
          transition={{ type: 'spring', stiffness: 160, damping: 26, mass: 0.9 }}
        />

        <AnimatePresence>
          {isHovered && photoHasEditorialCaption(photo) && (
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
              {(() => {
                const exif = [photo.focalLength, photo.aperture, photo.shutterSpeed, photo.iso].filter(Boolean);
                if (exif.length === 0) return null;
                return (
                  <p className="mt-0.5 text-white/50 text-[9px] font-mono">{exif.join(' · ')}</p>
                );
              })()}
              {photo.camera && (
                <p className="mt-1 text-[9px] font-mono uppercase tracking-wider text-white/40">{photo.camera}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
