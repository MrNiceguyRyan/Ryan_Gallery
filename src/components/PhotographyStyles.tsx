import { useState } from 'react';
import { motion } from 'framer-motion';
import type { StyleGroup } from '../types';

/**
 * Photography Styles — 水平手风琴悬停组件
 * 4-5 个面板并排，默认均分；悬停时当前面板扩展，其他收缩
 * 展示该风格的完整背景图和说明文字
 */
export default function PhotographyStyles({ styleGroups }: { styleGroups: StyleGroup[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!styleGroups || styleGroups.length === 0) return null;

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
          Photography Styles
        </h2>
        <p className="text-gray-400 mt-4 text-lg font-light">
          Five dimensions of a single vision.
        </p>
      </motion.div>

      {/* 手风琴容器 */}
      <motion.div
        className="flex gap-3 h-[420px] md:h-[520px] rounded-2xl overflow-hidden"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {styleGroups.map((group, index) => {
          const isHovered = hoveredIndex === index;
          const someoneHovered = hoveredIndex !== null;

          return (
            <motion.div
              key={group.category}
              className="relative overflow-hidden rounded-2xl cursor-pointer"
              onMouseEnter={() => setHoveredIndex(index)}
              animate={{
                flex: isHovered ? 3 : someoneHovered ? 0.6 : 1,
              }}
              transition={{
                duration: 0.6,
                ease: [0.25, 0.1, 0.25, 1],
              }}
            >
              {/* 背景图片 */}
              <motion.div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url(${group.coverImageUrl}?auto=format&w=1200&q=80)`,
                }}
                animate={{ scale: isHovered ? 1.08 : 1 }}
                transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
              />

              {/* 渐变遮罩 */}
              <motion.div
                className="absolute inset-0"
                animate={{
                  background: isHovered
                    ? 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)'
                    : 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.35) 100%)',
                }}
                transition={{ duration: 0.5 }}
              />

              {/* 内容层 */}
              <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8 z-10">
                {/* 序号 */}
                <motion.span
                  className="text-white/30 text-xs font-mono tracking-widest mb-auto"
                  animate={{ opacity: isHovered ? 1 : 0.5 }}
                >
                  0{index + 1}
                </motion.span>

                {/* 风格标签 */}
                <motion.h3
                  className="text-white font-light tracking-wide"
                  animate={{
                    fontSize: isHovered ? '2rem' : '1rem',
                    marginBottom: isHovered ? '0.75rem' : '0',
                  }}
                  transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  {group.label}
                </motion.h3>

                {/* 展开时显示描述 + 照片数量 */}
                <motion.div
                  animate={{
                    opacity: isHovered ? 1 : 0,
                    y: isHovered ? 0 : 20,
                    height: isHovered ? 'auto' : 0,
                  }}
                  transition={{ duration: 0.4, delay: isHovered ? 0.15 : 0 }}
                  className="overflow-hidden"
                >
                  <p className="text-white/70 text-sm font-light leading-relaxed max-w-xs">
                    {group.description}
                  </p>
                  <div className="flex items-center gap-2 mt-4">
                    <span className="text-xs text-white/40 font-mono">
                      {group.photos.length} photograph{group.photos.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-white/30">—</span>
                    <span className="text-xs text-white/60 tracking-wider">EXPLORE</span>
                    <svg className="w-3 h-3 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </motion.div>
              </div>

              {/* 收缩时，垂直文字标签（仅小屏以上） */}
              <motion.div
                className="absolute inset-0 hidden md:flex items-center justify-center"
                animate={{
                  opacity: !isHovered && someoneHovered ? 1 : 0,
                }}
                transition={{ duration: 0.3 }}
                style={{ pointerEvents: 'none' }}
              >
                <span
                  className="text-white/80 text-sm font-light tracking-[0.3em] uppercase"
                  style={{
                    writingMode: 'vertical-lr',
                    textOrientation: 'mixed',
                  }}
                >
                  {group.label}
                </span>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
