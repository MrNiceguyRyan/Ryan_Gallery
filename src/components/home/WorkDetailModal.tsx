import { motion, AnimatePresence } from 'framer-motion';
import type { Collection } from '../../types';

interface Props {
  collection: Collection | null;
  onClose: () => void;
}

export default function WorkDetailModal({ collection, onClose }: Props) {
  if (!collection) return null;

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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal content */}
          <motion.div
            className="relative z-10 w-[90vw] max-w-4xl max-h-[85vh] bg-white rounded-3xl overflow-hidden shadow-2xl"
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 40 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full bg-black/5 flex items-center justify-center
                hover:bg-black/10 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Hero image */}
            <div className="relative h-[300px] md:h-[400px]">
              <img
                src={`${collection.coverImageUrl}?auto=format&w=1200&q=85`}
                alt={collection.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
            </div>

            {/* Info */}
            <div className="px-8 pb-8 -mt-16 relative">
              <div className="flex items-center gap-3 mb-2">
                {collection.year && (
                  <span className="text-[10px] font-mono text-gray-400 tracking-wider">{collection.year}</span>
                )}
                {collection.location && (
                  <>
                    <span className="text-gray-200">·</span>
                    <span className="text-[10px] font-mono text-gray-400 tracking-wider">{collection.location}</span>
                  </>
                )}
              </div>

              <h2 className="text-3xl md:text-4xl font-extralight tracking-tight text-gray-900">
                {collection.name}
              </h2>

              {collection.subtitle && (
                <p className="text-gray-400 text-lg font-light mt-2">{collection.subtitle}</p>
              )}

              {collection.description && (
                <p className="text-gray-400 text-sm font-light mt-4 leading-relaxed max-w-2xl">
                  {collection.description}
                </p>
              )}

              {/* Photo preview grid */}
              {collection.photos && collection.photos.length > 0 && (
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mt-6">
                  {collection.photos.slice(0, 8).map((photo) => (
                    <div key={photo._id} className="aspect-square rounded-xl overflow-hidden">
                      <img
                        src={`${photo.imageUrl}?auto=format&w=300&q=75`}
                        alt={photo.title}
                        className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-4 mt-8">
                {collection.slug && (
                  <a
                    href={`/works/${collection.slug}`}
                    className="px-8 py-3 bg-gray-900 text-white text-sm font-light tracking-wider rounded-full
                      hover:bg-gray-800 transition-colors duration-300"
                  >
                    View Full Gallery
                  </a>
                )}
                {collection.liveProjectUrl && (
                  <a
                    href={collection.liveProjectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-8 py-3 border border-gray-200 text-gray-600 text-sm font-light tracking-wider rounded-full
                      hover:border-gray-900 hover:text-gray-900 transition-all duration-300"
                  >
                    View Live Project
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
