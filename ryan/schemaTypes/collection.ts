import {defineArrayMember, defineField, defineType, type ValidationContext} from 'sanity'

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
 * 分好章节之后，这个 Collection 还有几张照片不在任何章节里（封面除外）。
 * 它们不会消失，会排在故事最后的「More frames」里；这里只是让他知道还剩几张。
 * 只数已发布的照片，和网站上看到的一致。
 */
async function unplacedPhotos(chapters: unknown, context: ValidationContext): Promise<string | true> {
  if (!Array.isArray(chapters) || chapters.length === 0) return true
  const id = String(context.document?._id ?? '').replace(/^drafts\./, '')
  if (!id) return true
  const placed = chapters.flatMap((chapter) => {
    const photos = (chapter as {photos?: Array<{_ref?: string}>} | null)?.photos
    return Array.isArray(photos) ? photos.map((photo) => photo?._ref).filter(Boolean) : []
  })
  const cover = (context.document as {coverImage?: {asset?: {_ref?: string}}} | undefined)?.coverImage?.asset?._ref ?? ''
  try {
    const count = await context.getClient({apiVersion: '2025-04-01'}).fetch<number>(
      `count(*[_type == "photo" && references($id) && !(_id in path("drafts.**")) && !(_id in $placed) && image.asset._ref != $cover])`,
      {id, placed, cover},
    )
    return count > 0 ? `还有 ${count} 张照片没有放进任何章节，会排在最后的「More frames」里` : true
  } catch {
    // 查询失败（离线等）时不提示，不妨碍编辑。
    return true
  }
}

/** 故事正文的段落格式：英文和中文两个字段用同一套。 */
const introductionBlock = {
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
}

/** 金句必须是正文里原样的一句话（网站把它放大印在故事中间）。 */
function quoteInText(quote: unknown, blocks: unknown): string | true {
  if (typeof quote !== 'string' || !quote.trim() || !Array.isArray(blocks) || blocks.length === 0) return true
  const text = blocks
    .map((block) => ((block as {children?: Array<{text?: string}>})?.children ?? []).map((span) => span?.text ?? '').join(''))
    .join('\n')
  return text.includes(quote.trim()) ? true : '金句最好是正文里原样的一句话（改了正文，金句也要跟着改）'
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
  // 所有「· 中文」字段也集中在「中文」这一页，方便对照着改一遍。
  groups: [{name: 'zh', title: '中文'}],
  fields: [
    defineField({
      name: 'name',
      title: 'Collection Name',
      type: 'string',
      description: 'e.g. "Paris 2024", "Greece Summer", "Tokyo Neon"',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'nameZh',
      title: '名称 · 中文',
      type: 'string',
      group: 'zh',
      description: '中文版网站（右上角「中」）显示的名称，例如「迈阿密」。留空时，中文版显示英文。路牌（FL 01 MIAMI）始终是英文。',
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
      name: 'subtitleZh',
      title: '副标题 · 中文',
      type: 'string',
      group: 'zh',
      description: '中文版网站（右上角「中」）显示的副标题。留空时，中文版显示英文。',
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
      name: 'locationZh',
      title: '地点 · 中文',
      type: 'string',
      group: 'zh',
      description: '中文版网站（右上角「中」）显示的地点文字，例如「美国纽约」。留空时，中文版显示英文。',
    }),
    defineField({
      name: 'region',
      title: 'Region / Cluster',
      type: 'string',
      description: 'e.g. "Florida", "Arizona", "DMV", "Macau" — 用于首页按区域聚类（同一 region 的多个城市会归到一个区域中枢）',
    }),
    defineField({
      name: 'regionZh',
      title: '地区 · 中文',
      type: 'string',
      group: 'zh',
      description:
        '中文版网站（右上角「中」）显示的地区名，州名请带「州」，例如「佛罗里达州」「纽约州」（和城市「纽约」区分开）。只是显示用：分组和路牌上的州代码仍按上面的英文 Region。留空时，中文版显示英文。',
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
      name: 'descriptionZh',
      title: '简介 · 中文',
      type: 'text',
      rows: 3,
      group: 'zh',
      description: '中文版网站（右上角「中」）显示的简介（中文读者的浏览器标签页和书签用）。留空时，中文版显示英文。',
    }),
    defineField({
      name: 'introduction',
      title: 'Editorial Introduction',
      type: 'array',
      of: [introductionBlock],
      description: '在 Collection 页面侧边栏展示的精炼文案，支持段落和引用格式。建议 50-120 字，有文学感。',
    }),
    defineField({
      name: 'introductionZh',
      title: '故事正文 · 中文',
      type: 'array',
      of: [introductionBlock],
      group: 'zh',
      description:
        '中文版网站（右上角「中」）显示的故事正文，段落和英文一一对应（第一段是开篇导语，第二段是 Part II）。留空时：英文正文还是网站自带的那一版时，显示我们先译好的中文草稿；你改写了英文正文之后，中文版显示英文，直到这里填上新的中文。',
    }),
    defineField({
      name: 'dek',
      title: 'Dek / 一句话导语',
      type: 'text',
      rows: 2,
      description:
        '一句话：首页地点下方的说明，也是故事开篇标题下的导语。留空时用网站自带的那一句（例如 "Ocean Drive holds pastel facades…"）。',
    }),
    defineField({
      name: 'dekZh',
      title: '一句话导语 · 中文',
      type: 'text',
      rows: 2,
      group: 'zh',
      description: '中文版网站（右上角「中」）显示的一句话导语。留空时，中文版显示英文。',
    }),
    defineField({
      name: 'pullQuote',
      title: 'Pull quote / 金句',
      type: 'string',
      description:
        '故事中间放大印出的一句话，必须是英文正文里原样的一句（不加引号，句末不加句号）。留空时用网站自带的那一句；Bryce Canyon 和 New York 没有金句。',
      validation: (rule) => rule.custom((value, context) => quoteInText(value, (context.document as {introduction?: unknown})?.introduction)).warning(),
    }),
    defineField({
      name: 'pullQuoteZh',
      title: '金句 · 中文',
      type: 'string',
      group: 'zh',
      description: '中文版的金句，必须是上面「故事正文 · 中文」里原样的一句。改了中文正文，金句也要跟着改。' + '留空时，中文版显示英文。',
      validation: (rule) => rule.custom((value, context) => quoteInText(value, (context.document as {introductionZh?: unknown})?.introductionZh)).warning(),
    }),
    // ─────────────────────────────────────────
    // 小章节：把一个故事分成几个主题
    // ─────────────────────────────────────────
    defineField({
      name: 'chapters',
      title: '小章节 / Chapters (可选)',
      type: 'array',
      description:
        '可选。把这个故事分成几个小章节（主题），每章有标题、可选的小标签和导语，以及属于这一章的照片（按这里拖动的顺序显示）。打开故事后，开篇页和导语之后会有一个小目录，章节用罗马数字编号（Part I、II、III……，和照片的 01、02 编号区分开），点一下就滑到那一章。' +
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
              name: 'shortTitle',
              title: '目录短标题 / Short title (可选)',
              type: 'string',
              description:
                '可选。目录和手机上那一排章节标签用的短标题；不填就用上面的章节标题。标题较长时建议填一个，例如「Ocean Drive」。',
              validation: (rule) => rule.max(24),
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
                '从这个 Collection 自己的照片里选（只列出属于这个 Collection 的照片）。以缩略图排列，拖动可以调整顺序，网站按这个顺序显示。第一张会挂在章节标题旁边。',
              // 缩略图网格：照片标题都是自动生成的（Miami #24），只能靠缩略图认出是哪一张。
              options: {layout: 'grid'},
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
            select: {title: 'title', shortTitle: 'shortTitle', kicker: 'kicker', photos: 'photos', media: 'photos.0.image'},
            prepare({title, shortTitle, kicker, photos, media}) {
              const count = Array.isArray(photos) ? photos.length : 0
              return {
                title: title || '（无标题章节）',
                subtitle: [shortTitle && shortTitle !== title ? `目录：${shortTitle}` : '', kicker, `${count} 张照片`]
                  .filter(Boolean)
                  .join(' · '),
                media,
              }
            },
          },
        }),
      ],
      validation: (rule) => [
        rule.custom(repeatedPhotos).warning(),
        rule.custom(unplacedPhotos).warning(),
      ],
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
