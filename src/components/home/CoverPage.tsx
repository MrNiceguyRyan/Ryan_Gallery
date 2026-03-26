import { motion } from 'framer-motion';
import type { Collection } from '../../types';

interface Props {
  collections: Collection[];
}

export default function CoverPage({ collections }: Props) {
  // Show up to 6 cover images in a grid
  const covers = collections.slice(0, 6);

  return (
    <section className="min-h-screen relative px-6 md:px-16 py-20">
      {/* Section title */}
      <motion.div
        className="mb-12"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8 }}
      >
        <h2 className="text-5xl md:text-7xl font-extralight tracking-tighter text-gray-900 leading-[0.95]">
          Collections.
        </h2>
        <p className="text-gray-400 text-lg font-light mt-4 max-w-md">
          Every frame, a quiet conversation between light and intention.
        </p>
      </motion.div>

      {/* Cover grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-6xl">
        {covers.map((collection, i) => (
          <motion.div
            key={collection._id}
            className="group relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
          >
            {/* Image - grayscale default, color on hover */}
            <img
              src={`${collection.coverImageUrl}?auto=format&w=800&q=80`}
              alt={collection.name}
              className="w-full h-full object-cover grayscale-hover"
              loading="lazy"
            />

            {/* 90-degree guide bar with breathing animation */}
            <div className="absolute bottom-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="relative">
                {/* Vertical bar */}
                <div className="w-px h-12 bg-white/60 animate-breathe-glow" />
                {/* Horizontal bar */}
                <div className="h-px w-12 bg-white/60 animate-breathe-glow" />
              </div>
            </div>

            {/* Overlay info */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-white text-lg font-light tracking-wide pl-4">
                  {collection.name}
                </h3>
                {collection.subtitle && (
                  <p className="text-white/60 text-xs font-light mt-1 pl-4">
                    {collection.subtitle}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 pl-4">
                  {collection.year && (
                    <span className="text-white/40 text-[10px] font-mono">{collection.year}</span>
                  )}
                  {collection.location && (
                    <span className="text-white/40 text-[10px] font-mono">{collection.location}</span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
