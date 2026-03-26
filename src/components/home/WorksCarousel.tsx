import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection } from '../../types';

interface Props {
  collections: Collection[];
  onSelectWork: (collection: Collection) => void;
}

export default function WorksCarousel({ collections, onSelectWork }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [rotation, setRotation] = useState(0);

  const count = collections.length;
  const angleStep = 360 / count;
  const radius = 220;

  const goTo = useCallback(
    (i: number) => {
      setActiveIndex(i);
      setRotation(-i * angleStep);
    },
    [angleStep],
  );

  const prev = useCallback(() => {
    goTo((activeIndex - 1 + count) % count);
  }, [activeIndex, count, goTo]);

  const next = useCallback(() => {
    goTo((activeIndex + 1) % count);
  }, [activeIndex, count, goTo]);

  const activeCollection = collections[activeIndex];

  return (
    <section className="min-h-screen relative px-6 md:px-16 py-24 overflow-hidden">
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <h2 className="text-5xl md:text-7xl font-extralight tracking-tighter text-gray-900 leading-[0.95]">
          Works.
        </h2>
      </motion.div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-center min-h-[600px]">
        {/* Left: Ferris wheel carousel */}
        <div className="relative h-[500px] flex items-center justify-center">
          <motion.div
            className="relative w-[440px] h-[440px]"
            animate={{ rotate: rotation }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {collections.map((collection, i) => {
              const angle = (i * angleStep * Math.PI) / 180;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;
              const isActive = i === activeIndex;

              return (
                <motion.div
                  key={collection._id}
                  className="absolute cursor-pointer"
                  style={{
                    left: `calc(50% + ${x}px - 60px)`,
                    top: `calc(50% + ${y}px - 80px)`,
                  }}
                  animate={{
                    rotate: -rotation,
                    scale: isActive ? 1.15 : 0.85,
                    opacity: isActive ? 1 : 0.5,
                  }}
                  transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
                  onClick={() => goTo(i)}
                >
                  <div
                    className={`w-[120px] h-[160px] rounded-xl overflow-hidden shadow-lg transition-shadow duration-500 ${
                      isActive ? 'shadow-2xl ring-2 ring-gray-900/10' : ''
                    }`}
                  >
                    <img
                      src={`${collection.coverImageUrl}?auto=format&w=300&q=80`}
                      alt={collection.name}
                      className={`w-full h-full object-cover transition-all duration-700 ${
                        isActive ? '' : 'opacity-60'
                      }`}
                    />
                  </div>
                </motion.div>
              );
            })}

            {/* Center circle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gray-200" />
          </motion.div>

          {/* Prev / Next arrows */}
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors"
            aria-label="Previous"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors"
            aria-label="Next"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {/* Navigation dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {collections.map((_, i) => (
              <button
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i === activeIndex ? 'bg-gray-900 w-4' : 'bg-gray-300'
                }`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </div>

        {/* Right: Text description */}
        <div className="flex flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCollection._id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.5 }}
            >
              <span className="text-[10px] font-mono text-gray-300 tracking-wider uppercase">
                {String(activeIndex + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
              </span>

              <h3 className="text-4xl md:text-5xl font-extralight tracking-tight text-gray-900 mt-3 leading-tight">
                {activeCollection.name}
              </h3>

              {activeCollection.subtitle && (
                <p className="text-gray-400 text-lg font-light mt-3">
                  {activeCollection.subtitle}
                </p>
              )}

              {activeCollection.description && (
                <p className="text-gray-400 text-sm font-light mt-4 leading-relaxed max-w-md">
                  {activeCollection.description}
                </p>
              )}

              <div className="flex items-center gap-4 mt-4 text-[10px] font-mono text-gray-300">
                {activeCollection.year && <span>{activeCollection.year}</span>}
                {activeCollection.location && (
                  <>
                    <span className="text-gray-200">|</span>
                    <span>{activeCollection.location}</span>
                  </>
                )}
                {activeCollection.photoCount != null && (
                  <>
                    <span className="text-gray-200">|</span>
                    <span>{activeCollection.photoCount} photos</span>
                  </>
                )}
              </div>

              {/* CTA buttons */}
              <div className="flex items-center gap-4 mt-8">
                <button
                  onClick={() => onSelectWork(activeCollection)}
                  className="px-6 py-2.5 bg-gray-900 text-white text-sm font-light tracking-wider rounded-full
                    hover:bg-gray-800 transition-colors duration-300"
                >
                  View Details
                </button>

                {activeCollection.slug && (
                  <a
                    href={`/works/${activeCollection.slug}`}
                    className="px-6 py-2.5 border border-gray-200 text-gray-600 text-sm font-light tracking-wider rounded-full
                      hover:border-gray-900 hover:text-gray-900 transition-all duration-300"
                  >
                    Full Gallery
                  </a>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
