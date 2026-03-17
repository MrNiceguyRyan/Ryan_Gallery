import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Collection } from '../types';

/**
 * Galleries — "便当盒" Bento Grid
 * 不同大小的卡片拼凑成错落有致的网格，背景为系列封面图
 * 默认暗色遮罩 + 白色标题；悬停时遮罩变浅，图片放大
 */
export default function Galleries({ collections }: { collections: Collection[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (!collections || collections.length === 0) return null;

  // 根据 gridSize 决定 CSS Grid 的 span 值
  const getGridClass = (size: string, index: number) => {
    switch (size) {
      case 'large':
        return 'md:col-span-2 md:row-span-2';
      case 'small':
        return 'col-span-1 row-span-1';
      default:
        // medium：偶数位跨2列，奇数位1列，营造节奏感
        return index % 3 === 0 ? 'md:col-span-2 row-span-1' : 'col-span-1 row-span-1';
    }
  };

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
          Galleries
        </h2>
        <p className="text-gray-400 mt-4 text-lg font-light">
          Collections from places that shaped my lens.
        </p>
      </motion.div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 auto-rows-[280px] gap-4">
        {collections.map((col, index) => {
          const isHovered = hoveredId === col._id;
          return (
            <motion.div
              key={col._id}
              className={`relative overflow-hidden rounded-2xl cursor-pointer ${getGridClass(col.gridSize, index)}`}
              onMouseEnter={() => setHoveredId(col._id)}
              onMouseLeave={() => setHoveredId(null)}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: index * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {/* 背景图片 */}
              <motion.div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url(${col.coverImageUrl}?auto=format&w=1200&q=80)`,
                }}
                animate={{ scale: isHovered ? 1.05 : 1 }}
                transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
              />

              {/* 暗色遮罩：悬停变浅 */}
              <motion.div
                className="absolute inset-0"
                animate={{
                  backgroundColor: isHovered
                    ? 'rgba(0, 0, 0, 0.25)'
                    : 'rgba(0, 0, 0, 0.45)',
                }}
                transition={{ duration: 0.5 }}
              />

              {/* 居中的标题内容 */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 z-10">
                <motion.h3
                  className="text-2xl md:text-3xl font-light text-white tracking-wide"
                  animate={{ y: isHovered ? -4 : 0 }}
                  transition={{ duration: 0.4 }}
                >
                  {col.name}
                </motion.h3>
                {col.subtitle && (
                  <motion.p
                    className="text-white/70 text-sm mt-2 font-light"
                    animate={{ opacity: isHovered ? 1 : 0.7, y: isHovered ? -2 : 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    {col.subtitle}
                  </motion.p>
                )}
                {/* 悬停时显示更多信息 */}
                <motion.div
                  className="flex items-center gap-3 mt-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 10 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  {col.location && (
                    <span className="text-xs text-white/60 font-light tracking-wider uppercase">
                      {col.location}
                    </span>
                  )}
                  {col.photoCount != null && col.photoCount > 0 && (
                    <span className="text-xs text-white/50">
                      {col.photoCount} photos
                    </span>
                  )}
                </motion.div>
              </div>

              {/* 底部微妙的渐变 */}
              <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
