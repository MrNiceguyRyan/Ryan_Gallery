import {defineArrayMember, defineField, defineType} from 'sanity'

/** 章节里同一张照片出现在两个章节时：网站只放在第一个章节里，这里给出提醒。 */
function repeatedPhotos(chapters: unknown): string | true {
  if (!Array.isArray(chapters)) return true
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const chapter of chapters) {
    const photos = (chapter as {photos?: Array<{_ref?: string}>} | null)?.photos
    for (const photo of Array.isArray(photos) ? photos : []) {
      const id = photo?._ref
      if (!id) continue
      if (seen.has(id)) repeated.add(id)
      seen.add(id)
    }
  }
  return repeated.size === 0
    ? true
    : `有 ${repeated.size} 张照片被放进了不止一个章节；网站上它只会出现在第一个章节里`
}

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
      name: 'region',
      title: 'Region / Cluster',
      type: 'string',
      description: 'e.g. "Florida", "Arizona", "DMV", "Macau" — 用于首页按区域聚类（同一 region 的多个城市会归到一个区域中枢）',
    }),
    defineField({
      name: 'routeOrder',
      title: 'Route / Chapter Order',
      type: 'number',
      description: '首页旅行路线中的明确顺序。数值越小越靠前；新增地点可以插入任意位置，不再依赖年份或创建时间。',
      validation: (rule) => rule.integer().positive(),
    }),
    defineField({
      name: 'mapLocation',
      title: 'Map Location',
      type: 'geopoint',
      description: '该系列在首页路线地图上的正式锚点。建议设在城市或地标中心；未填写时网站才会使用照片定位作为后备。',
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
    // ─────────────────────────────────────────
    // 小章节：把一个故事分成几个主题
    // ─────────────────────────────────────────
    defineField({
      name: 'chapters',
      title: '小章节 / Chapters (可选)',
      type: 'array',
      description:
        '可选。把这个故事分成几个小章节（主题），每章有标题、可选的小标签和导语，以及属于这一章的照片（按这里拖动的顺序显示）。打开故事后，开篇页和导语之后会有一个带编号的小目录（01、02……），点一下就滑到那一章。' +
        '封面照片固定是开篇页的第 01 帧，不会在章节里重复出现。没放进任何章节的照片不会消失，会排在最后，归在「More frames」里。一张照片都没有的章节不会显示。不填章节时，故事和现在完全一样。',
      of: [
        defineArrayMember({
          name: 'storyChapter',
          title: '章节 / Chapter',
          type: 'object',
          fields: [
            defineField({
              name: 'title',
              title: '章节标题 / Title',
              type: 'string',
              description: '显示在目录里和这一章的开头，例如「Night on Ocean Drive」。建议英文 40 字符、中文 16 字以内。',
              validation: (rule) => [
                rule.required().max(90),
                rule
                  .custom((value) =>
                    typeof value === 'string' && value.length > 40
                      ? '标题建议英文 40 字符、中文 16 字以内，太长在目录里会折好几行'
                      : true,
                  )
                  .warning(),
              ],
            }),
            defineField({
              name: 'kicker',
              title: '小标签 / Kicker (可选)',
              type: 'string',
              description: '可选。标题上方一行小字，和章节编号排在一起，例如「After dark」。',
              validation: (rule) => rule.max(40),
            }),
            defineField({
              name: 'intro',
              title: '章节导语 / Intro (可选)',
              type: 'text',
              rows: 3,
              description: '可选。标题下面的一两句话，介绍这一章。英文约 40 词、中文约 80 字以内。',
              validation: (rule) => rule.max(400),
            }),
            defineField({
              name: 'photos',
              title: '这一章的照片 / Photos',
              type: 'array',
              description:
                '从这个 Collection 自己的照片里选（只列出属于这个 Collection 的照片）。拖动可以调整顺序，网站按这个顺序显示。第一张会挂在章节标题旁边。',
              of: [
                defineArrayMember({
                  type: 'reference',
                  to: [{type: 'photo'}],
                  // 弱引用：以后删除照片时不会被章节挡住，网站会自动忽略已删除的照片。
                  weak: true,
                  options: {
                    disableNew: true,
                    filter: ({document}) => ({
                      filter: 'collection._ref == $collectionId',
                      params: {collectionId: String(document?._id ?? '').replace(/^drafts\./, '')},
                    }),
                  },
                }),
              ],
              validation: (rule) => rule.unique(),
            }),
          ],
          preview: {
            select: {title: 'title', kicker: 'kicker', photos: 'photos', media: 'photos.0.image'},
            prepare({title, kicker, photos, media}) {
              const count = Array.isArray(photos) ? photos.length : 0
              return {
                title: title || '（无标题章节）',
                subtitle: [kicker, `${count} 张照片`].filter(Boolean).join(' · '),
                media,
              }
            },
          },
        }),
      ],
      validation: (rule) => rule.custom(repeatedPhotos).warning(),
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
