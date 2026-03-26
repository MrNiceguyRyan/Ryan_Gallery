import { useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Collection, Photo } from '../../types';

interface Props {
  collection: Collection;
  photos: Photo[];
}

export default function WorkDetailPage({ collection, photos }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const velocityRef = useRef(0);
  const rafRef = useRef<number>(0);

  // Horizontal scroll on mouse wheel with inertia
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;

    velocityRef.current += e.deltaY * 0.8;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('wheel', handleWheel, { passive: false });

    // Inertia animation loop
    const animate = () => {
      if (scrollRef.current && Math.abs(velocityRef.current) > 0.5) {
        scrollRef.current.scrollLeft += velocityRef.current;
        velocityRef.current *= 0.92; // friction
      } else {
        velocityRef.current = 0;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      cancelAnimationFrame(rafRef.current);
    };
  }, [handleWheel]);

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <nav className="fixed top-0 left-0 right-0 z-30 px-6 md:px-16 py-5 flex items-center justify-between bg-white/80 backdrop-blur-lg">
        <a
          href="/"
          className="text-sm font-light text-gray-400 hover:text-gray-900 transition-colors tracking-wider"
        >
          &larr; Back
        </a>
        <span className="text-[10px] font-mono text-gray-300 tracking-wider uppercase">
          {collection.name}
        </span>
      </nav>

      {/* Main content: left intro + right horizontal gallery */}
      <div className="flex min-h-screen pt-20">
        {/* Left: Chinese-style introduction */}
        <div className="hidden lg:flex w-[360px] flex-shrink-0 flex-col justify-center px-12 border-r border-gray-100">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <span className="text-[10px] font-mono text-gray-300 tracking-wider">
              {collection.year} · {collection.location}
            </span>

            <h1 className="text-4xl font-extralight tracking-tight text-gray-900 mt-4 leading-tight">
              {collection.name}
            </h1>

            {collection.subtitle && (
              <p className="text-gray-400 text-base font-light mt-3">
                {collection.subtitle}
              </p>
            )}

            {collection.description && (
              <p className="text-gray-400 text-sm font-light mt-6 leading-relaxed">
                {collection.description}
              </p>
            )}

            {collection.introduction && (
              <p className="text-gray-500 text-sm font-light mt-4 leading-relaxed border-l-2 border-gray-200 pl-4">
                {collection.introduction}
              </p>
            )}

            <div className="mt-8 flex items-center gap-3 text-[10px] font-mono text-gray-300">
              <span>{photos.length} photographs</span>
              <span>·</span>
              <span>Nikon Zf</span>
            </div>
          </motion.div>
        </div>

        {/* Right: Horizontal scroll gallery */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto no-scrollbar flex items-center px-8 lg:px-16 gap-6"
        >
          {/* Mobile: Collection title card */}
          <div className="lg:hidden flex-shrink-0 w-[280px] flex flex-col justify-center pr-4">
            <span className="text-[10px] font-mono text-gray-300 tracking-wider">
              {collection.year}
            </span>
            <h1 className="text-3xl font-extralight tracking-tight text-gray-900 mt-2">
              {collection.name}
            </h1>
            {collection.subtitle && (
              <p className="text-gray-400 text-sm font-light mt-2">{collection.subtitle}</p>
            )}
          </div>

          {/* Photo cards - staggered heights */}
          {photos.map((photo, i) => {
            const isOdd = i % 2 === 1;
            return (
              <motion.div
                key={photo._id}
                className={`flex-shrink-0 ${isOdd ? 'mt-16' : '-mt-8'}`}
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.1 }}
              >
                <div className="group w-[280px] md:w-[340px] aspect-[3/4] rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-500">
                  <img
                    src={`${photo.imageUrl}?auto=format&w=700&q=85`}
                    alt={photo.title}
                    className="w-full h-full object-cover "
                    loading="lazy"
                  />
                </div>

                {/* Photo meta */}
                <div className="mt-3 px-1">
                  <p className="text-sm font-light text-gray-600">{photo.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-gray-300">
                    {photo.focalLength && <span>{photo.focalLength}</span>}
                    {photo.aperture && <span>{photo.aperture}</span>}
                    {photo.shutterSpeed && <span>{photo.shutterSpeed}</span>}
                    {photo.iso && <span>ISO {photo.iso}</span>}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* End spacer */}
          <div className="flex-shrink-0 w-16" />
        </div>
      </div>
    </div>
  );
}
