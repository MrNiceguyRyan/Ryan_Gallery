import {defineField, defineType} from 'sanity'

/**
 * Collection / Series document type
 * 代表一个拍摄系列，例如 "Paris 2024"、"Greece Summer" 等
 * Photo 文档通过 reference 字段指向这里
 */
export default defineType({
  name: 'collection',
  title: 'Collection / Series',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Collection Name',
      type: 'string',
      description: 'e.g. "Paris 2024", "Greece Summer", "Tokyo Neon"',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug (URL identifier)',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96,
      },
      description: '自动从名称生成，用于 URL 路径',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'subtitle',
      title: 'Subtitle / Tagline',
      type: 'string',
      description: 'e.g. "A story of light and shadow" — 显示在画廊卡片上的副标题',
    }),
    defineField({
      name: 'coverImage',
      title: 'Cover Image',
      type: 'image',
      options: {hotspot: true},
      description: '这张系列的封面图，显示在 Galleries 网格里',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'location',
      title: 'Primary Location',
      type: 'string',
      description: 'e.g. "Paris, France" — 显示在卡片上的地点文字',
    }),
    defineField({
      name: 'year',
      title: 'Year',
      type: 'number',
      description: '拍摄年份，e.g. 2024',
    }),
    defineField({
      name: 'description',
      title: 'Short Description (SEO / meta)',
      type: 'text',
      rows: 3,
      description: '用于 SEO meta description 和 Open Graph 描述，1-2 句话',
    }),
    defineField({
      name: 'descriptionCN',
      title: 'Description (Chinese)',
      type: 'text',
      rows: 3,
      description: '中文系列描述 — 作为主文显示',
    }),
    defineField({
      name: 'descriptionEN',
      title: 'Description (English)',
      type: 'text',
      rows: 3,
      description: 'English description — displayed as secondary text',
    }),
    defineField({
      name: 'introduction',
      title: 'Editorial Introduction',
      type: 'array',
      of: [{
        type: 'block',
        styles: [
          {title: 'Normal', value: 'normal'},
          {title: 'Quote', value: 'blockquote'},
        ],
        marks: {
          decorators: [
            {title: 'Italic', value: 'em'},
            {title: 'Strong', value: 'strong'},
          ],
          annotations: [],
        },
        lists: [],
      }],
      description: '在 Collection 页面侧边栏展示的精炼文案，支持段落和引用格式。建议 50-120 字，有文学感。',
    }),
    defineField({
      name: 'featured',
      title: 'Featured on Homepage',
      type: 'boolean',
      description: '是否在首页的 Galleries 网格中展示',
      initialValue: false,
    }),
    // 控制在 Galleries 网格中的卡片尺寸（便当盒布局）
    defineField({
      name: 'gridSize',
      title: 'Grid Card Size',
      type: 'string',
      options: {
        list: [
          {title: 'Large (跨 2 列)', value: 'large'},
          {title: 'Medium (默认)', value: 'medium'},
          {title: 'Small (半高)', value: 'small'},
        ],
        layout: 'radio',
      },
      initialValue: 'medium',
      description: '控制在首页 Galleries 网格里这张卡片的视觉大小',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'location',
      media: 'coverImage',
    },
  },
})
