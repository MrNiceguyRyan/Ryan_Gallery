import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'photo',
  title: 'Photography',
  type: 'document',
  // 在 Sanity Studio 后台的预览卡片
  preview: {
    select: {
      title: 'title',
      subtitle: 'styleCategory',
      media: 'image',
    },
    prepare({title, subtitle, media}) {
      const categoryLabels: Record<string, string> = {
        landscape: '🏔 Landscape',
        portrait: '🧍 Portrait',
        street: '🏙 Street',
        architecture: '🏛 Architecture',
        abstract: '🎨 Abstract',
      }
      return {
        title,
        subtitle: subtitle ? categoryLabels[subtitle] : 'Uncategorized',
        media,
      }
    },
  },
  fields: [
    // ─────────────────────────────────────────
    // 基础信息
    // ─────────────────────────────────────────
    defineField({
      name: 'title',
      title: 'Photo Title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Upload Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      validation: (rule) => rule.required(),
    }),

    // ─────────────────────────────────────────
    // 新增：分类 & 系列关联
    // ─────────────────────────────────────────
    defineField({
      name: 'collection',
      title: 'Collection / Series',
      type: 'reference',
      to: [{type: 'collection'}],
      description: '这张照片属于哪个拍摄系列（e.g. Paris 2024）',
    }),
    defineField({
      name: 'styleCategory',
      title: 'Photography Style',
      type: 'string',
      options: {
        list: [
          {title: '🏔 Landscape', value: 'landscape'},
          {title: '🧍 Portrait', value: 'portrait'},
          {title: '🏙 Street', value: 'street'},
          {title: '🏛 Architecture', value: 'architecture'},
          {title: '🎨 Abstract', value: 'abstract'},
        ],
        layout: 'radio',
      },
      description: '摄影风格分类，用于首页风格手风琴面板',
    }),

    // ─────────────────────────────────────────
    // 新增：地理位置（用于地图打点）
    // ─────────────────────────────────────────
    defineField({
      name: 'location',
      title: 'Shooting Location',
      type: 'object',
      description: '拍摄地点坐标，用于"Latitude of Memories"交互地图',
      fields: [
        defineField({
          name: 'lat',
          title: 'Latitude (纬度)',
          type: 'number',
          description: 'e.g. 48.8566 (Paris)',
          validation: (rule) => rule.min(-90).max(90),
        }),
        defineField({
          name: 'lng',
          title: 'Longitude (经度)',
          type: 'number',
          description: 'e.g. 2.3522 (Paris)',
          validation: (rule) => rule.min(-180).max(180),
        }),
        defineField({
          name: 'city',
          title: 'City / Place Name',
          type: 'string',
          description: 'e.g. "Paris", "Santorini", "Tokyo Shibuya"',
        }),
        defineField({
          name: 'country',
          title: 'Country',
          type: 'string',
          description: 'e.g. "France", "Greece", "Japan"',
        }),
      ],
    }),

    // ─────────────────────────────────────────
    // 原有 EXIF 数据（保持不变）
    // ─────────────────────────────────────────
    defineField({
      name: 'camera',
      title: 'Camera Model',
      type: 'string',
      initialValue: 'Nikon Zf',
    }),
    defineField({
      name: 'focalLength',
      title: 'Focal Length (e.g., 40mm)',
      type: 'string',
    }),
    defineField({
      name: 'aperture',
      title: 'Aperture (e.g., f/2.8)',
      type: 'string',
    }),
    defineField({
      name: 'shutterSpeed',
      title: 'Shutter Speed (e.g., 1/500s)',
      type: 'string',
    }),
    defineField({
      name: 'iso',
      title: 'ISO (e.g., ISO 100)',
      type: 'string',
    }),
  ],
})
