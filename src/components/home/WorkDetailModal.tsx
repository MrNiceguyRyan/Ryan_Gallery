import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection } from '../../types';

interface Props {
  collection: Collection | null;
  onClose: () => void;
}

export default function WorkDetailModal({ collection, onClose }: Props) {
  const [activePhoto, setActivePhoto] = useState(0);
  const dragRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  // Safely measure container width on mount (avoids SSR window reference)
  useEffect(() => {
    const updateWidth = () => {
      if (dragRef.current?.parentElement) {
        setContainerWidth(dragRef.current.parentElement.clientWidth);
      } else {
        setContainerWidth(window.innerWidth * 0.78);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [collection]);

  // Keyboard: Escape to close
  useEffect(() => {
    if (!collection) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [collection, onClose]);

  // Reset active photo when collection changes
  useEffect(() => {
    setActivePhoto(0);
  }, [collection?._id]);

  if (!collection) return null;

  const photos = collection.photos ?? [];
  const CARD_W = 220;
  const CARD_GAP = 16;
  const totalWidth = photos.length * (CARD_W + CARD_GAP);

  return (
    <AnimatePresence>
      {collection && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative z-10 w-[92vw] max-w-4xl bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
            initial={{ opacity: 0, scale: 0.92, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 40 }}
            transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/8 flex items-center justify-center hover:bg-black/15 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Hero image */}
            <div className="relative h-52 md:h-72">
              <img
                src={`${collection.coverImageUrl}?auto=format&w=1200&q=85`}
                alt={collection.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
            </div>

            {/* Info */}
            <div className="px-7 pb-3 -mt-10 relative">
              <div className="flex items-center gap-2 mb-1">
                {collection.year && (
                  <span className="text-[10px] font-mono text-gray-400 tracking-wider">{collection.year}</span>
                )}
                {collection.location && (
                  <>
                    <span className="text-gray-300">&middot;</span>
                    <span className="text-[10px] font-mono text-gray-400 tracking-wider">{collection.location}</span>
                  </>
                )}
                {photos.length > 0 && (
                  <>
                    <span className="text-gray-300">&middot;</span>
                    <span className="text-[10px] font-mono text-gray-400 tracking-wider">{photos.length} photos</span>
                  </>
                )}
              </div>

              <h2 className="text-3xl font-extralight tracking-tight text-gray-900">
                {collection.name}
              </h2>
              {collection.subtitle && (
                <p className="text-gray-400 text-sm font-light mt-1">{collection.subtitle}</p>
              )}
            </div>

            {/* ── Draggable photo strip ── */}
            {photos.length > 0 && (
              <div className="mt-3 mb-1">
                {/* Drag hint */}
                <p className="px-7 text-[10px] text-gray-300 font-light tracking-widest uppercase mb-3 flex items-center gap-2">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5M3.75 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  drag to browse
                </p>

                {/* Overflow container */}
                <div className="overflow-hidden px-7">
                  <motion.div
                    ref={dragRef}
                    className="flex gap-4 cursor-grab active:cursor-grabbing select-none"
                    drag="x"
                    dragConstraints={{
                      right: 0,
                      left: Math.min(0, -(totalWidth - containerWidth)),
                    }}
                    dragElastic={0.08}
                    dragMomentum={true}
                    dragTransition={{ bounceStiffness: 300, bounceDamping: 40 }}
                    whileTap={{ cursor: 'grabbing' }}
                  >
                    {photos.map((photo, i) => (
                      <motion.div
                        key={photo._id}
                        className="flex-shrink-0 rounded-2xl overflow-hidden bg-gray-100"
                        style={{ width: CARD_W, height: 280 }}
                        animate={{ opacity: i === activePhoto ? 1 : 0.65, scale: i === activePhoto ? 1 : 0.96 }}
                        transition={{ duration: 0.3 }}
                        onClick={() => setActivePhoto(i)}
                        whileHover={{ opacity: 1, scale: 1 }}
                      >
                        <img
                          src={`${photo.imageUrl}?auto=format&w=500&q=80`}
                          alt={photo.title}
                          className="w-full h-full object-cover pointer-events-none"
                          draggable={false}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                </div>

                {/* Dots indicator */}
                <div className="flex justify-center gap-1.5 mt-4 mb-1">
                  {photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActivePhoto(i)}
                      className={`rounded-full transition-all duration-300 ${
                        i === activePhoto ? 'w-4 h-1.5 bg-gray-900' : 'w-1.5 h-1.5 bg-gray-200'
                      }`}
                      aria-label={`Go to photo ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 px-7 py-5 border-t border-gray-50 mt-2">
              {collection.slug && (
                <a
                  href={`/works/${collection.slug}`}
                  className="px-7 py-2.5 bg-gray-900 text-white text-sm font-light tracking-wider rounded-full hover:bg-gray-800 transition-colors"
                >
                  View Full Gallery
                </a>
              )}
              {collection.liveProjectUrl && (
                <a
                  href={collection.liveProjectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-7 py-2.5 border border-gray-200 text-gray-600 text-sm font-light tracking-wider rounded-full hover:border-gray-900 hover:text-gray-900 transition-all"
                >
                  Live Project
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
