import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Photo } from '../types';

/**
 * Echoes in Frames — 瀑布流照片墙 + 全屏灯箱
 * CSS columns 实现砌砖式错落布局
 * 卡片圆角 + 悬停浮起 + 阴影
 * 点击打开全屏灯箱查看大图和 EXIF 数据
 */
export default function MasonryWall({ photos }: { photos: Photo[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedPhoto = selectedIndex !== null ? photos[selectedIndex] : null;

  if (!photos || photos.length === 0) return null;

  return (
    <section className="py-24 px-6 md:px-16 max-w-7xl mx-auto">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        className="mb-16"
      >
        <h2 className="text-4xl md:text-5xl font-light tracking-tight text-gray-900">
          Echoes in Frames
        </h2>
        <p className="text-gray-400 mt-4 text-lg font-light">
          Every shutter click, a whispered conversation with light.
        </p>
      </motion.div>

      {/* ── 瀑布流网格 ── */}
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
        {photos.map((photo, index) => (
          <motion.div
            key={photo._id || photo.title}
            className="break-inside-avoid group cursor-pointer"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-30px' }}
            transition={{ duration: 0.5, delay: (index % 4) * 0.08 }}
            onClick={() => setSelectedIndex(index)}
          >
            <div className="relative overflow-hidden rounded-xl bg-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 ease-out">
              {/* 照片 */}
              <img
                src={`${photo.imageUrl}?auto=format&w=800&q=80`}
                alt={photo.title}
                className="w-full h-auto object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                loading="lazy"
              />

              {/* 悬浮遮罩 + 标题 */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-5 pointer-events-none">
                <h3 className="text-white text-lg font-light tracking-wide">
                  {photo.title}
                </h3>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-white/60 font-mono">
                  {photo.camera && <span>{photo.camera}</span>}
                  {photo.focalLength && <span>· {photo.focalLength}</span>}
                  {photo.aperture && <span>· {photo.aperture}</span>}
                </div>
                {photo.collection && (
                  <span className="inline-block mt-2 text-[10px] text-white/40 uppercase tracking-[0.2em]">
                    {photo.collection.name}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── 全屏灯箱 ── */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 bg-white/95 backdrop-blur-2xl flex flex-col items-center justify-center cursor-zoom-out"
            onClick={() => setSelectedIndex(null)}
          >
            {/* 顶部导航 */}
            <div className="absolute top-0 left-0 right-0 py-6 px-8 flex items-center justify-between z-10">
              <h1 className="text-xl font-light text-gray-900 tracking-tight">
                Visual Archive.
              </h1>
              <div className="flex items-center gap-4">
                {/* 计数器 */}
                <span className="text-xs text-gray-400 font-mono">
                  {(selectedIndex ?? 0) + 1} / {photos.length}
                </span>
                {/* 关闭按钮 */}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  className="text-gray-400 hover:text-gray-900 transition-colors p-2 rounded-full hover:bg-gray-100"
                  onClick={(e) => { e.stopPropagation(); setSelectedIndex(null); }}
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </motion.button>
              </div>
            </div>

            {/* 左右导航 */}
            {selectedIndex !== null && selectedIndex > 0 && (
              <button
                className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                onClick={(e) => { e.stopPropagation(); setSelectedIndex(selectedIndex - 1); }}
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {selectedIndex !== null && selectedIndex < photos.length - 1 && (
              <button
                className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                onClick={(e) => { e.stopPropagation(); setSelectedIndex(selectedIndex + 1); }}
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {/* 主图 + EXIF */}
            <div
              className="relative flex flex-col items-center justify-center gap-6 max-w-5xl mx-auto px-16"
              onClick={(e) => e.stopPropagation()}
            >
              <AnimatePresence mode="wait">
                <motion.img
                  key={selectedPhoto._id || selectedPhoto.title}
                  src={`${selectedPhoto.imageUrl}?auto=format&w=2400&q=90`}
                  alt={selectedPhoto.title}
                  className="max-w-full max-h-[72vh] object-contain rounded-xl shadow-2xl"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                />
              </AnimatePresence>

              {/* EXIF 信息条 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="text-center"
              >
                <h2 className="text-2xl font-light text-gray-900 tracking-wide">
                  {selectedPhoto.title}
                </h2>
                <div className="flex flex-wrap items-center justify-center gap-3 mt-3 text-xs text-gray-400 font-mono">
                  {selectedPhoto.camera && (
                    <span className="bg-gray-100 px-3 py-1 rounded-full text-gray-600">
                      {selectedPhoto.camera}
                    </span>
                  )}
                  {selectedPhoto.focalLength && <span>{selectedPhoto.focalLength}</span>}
                  {selectedPhoto.aperture && <span>·  {selectedPhoto.aperture}</span>}
                  {selectedPhoto.shutterSpeed && <span>·  {selectedPhoto.shutterSpeed}</span>}
                  {selectedPhoto.iso && <span>·  {selectedPhoto.iso}</span>}
                </div>
                {(selectedPhoto.collection || selectedPhoto.location?.city) && (
                  <div className="flex items-center justify-center gap-2 mt-2 text-xs text-gray-300">
                    {selectedPhoto.collection && <span>{selectedPhoto.collection.name}</span>}
                    {selectedPhoto.collection && selectedPhoto.location?.city && <span>·</span>}
                    {selectedPhoto.location?.city && <span>{selectedPhoto.location.city}</span>}
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
