import {defineArrayMember, defineField, defineType} from 'sanity'

/**
 * Note — 笔记 / 创作感悟
 * 网站上的 NOTES 栏目：每一篇是一页"专栏"，写拍摄的感悟、过程和路上的事。
 * 发布（Publish）之后，下一次网站构建时就会出现在 ryanxugallery.com/notes。
 * 没有任何已发布的笔记时，导航栏里不会出现 NOTES。
 */

/** 中文按字数、英文按字符数估算长短（网页上一个汉字大约占两三个英文字母的宽度）。 */
function tooLong(value: unknown, maxZh: number, maxEn: number): boolean {
  if (typeof value !== 'string') return false
  const han = value.match(/\p{Script=Han}/gu)?.length ?? 0
  return han * 3 >= value.length ? value.length > maxZh : value.length > maxEn
}

/**
 * 网址短名：只保留英文字母、数字和连字符。
 * 纯中文标题会得到空结果，这时用日期代替（note-2026-09-27），
 * 也可以手动改成一个英文或拼音短名，例如 waiting-for-light。
 */
function slugify(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  if (ascii) return ascii
  return `note-${new Date().toISOString().slice(0, 10)}`
}

export default defineType({
  name: 'note',
  title: '笔记 / Note',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: '标题 / Title',
      type: 'string',
      description: '笔记的标题，显示在 Notes 列表和文章页顶部。中文、英文都可以。',
      validation: (rule) => [
        rule.required().max(120),
        rule
          .custom((value) => (tooLong(value, 24, 70) ? '标题建议英文 70 字符、中文 24 字以内，太长在页面上会占好几行' : true))
          .warning(),
      ],
    }),
    defineField({
      name: 'slug',
      title: '网址短名 / Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 80,
        slugify,
      },
      description:
        '文章的网址：ryanxugallery.com/notes/<短名>。点 Generate 从标题生成；中文标题会生成日期短名，也可以自己写英文或拼音（只用小写字母、数字和 -）。发布后尽量不要再改，否则旧链接会失效。',
      validation: (rule) =>
        rule.required().custom((value) => {
          const current = value?.current
          if (!current) return true
          return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(current)
            ? true
            : '只能用小写英文字母、数字和连字符 -，例如 waiting-for-light'
        }),
    }),
    defineField({
      name: 'publishedAt',
      title: '发布日期 / Published',
      type: 'datetime',
      description: '显示在文章上的日期，列表按它从新到旧排列。默认是创建的时间，可以改成过去的日期。',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'dek',
      title: '导语 / Dek',
      type: 'text',
      rows: 3,
      description:
        '简短导语：显示在标题下面和 Notes 列表里，也用作搜索引擎和分享卡片的描述。1–2 句：英文约 30 词，中文约 60 字。About 页中间的预告也会引用导语（引用勾选了下面「在 About 页引用」的那篇；一篇都没勾时用最新的一篇）。',
      validation: (rule) =>
        rule
          .custom((value) => (tooLong(value, 60, 200) ? '导语 1–2 句：英文约 30 词（200 字符），中文约 60 字' : true))
          .warning(),
    }),
    defineField({
      name: 'cover',
      title: '封面照片 / Cover (可选)',
      type: 'image',
      options: {hotspot: true},
      description: '可选。按照片原本的比例显示在标题下方，也用作分享卡片（分享卡片会以焦点 hotspot 为中心裁切）。',
      fields: [
        defineField({
          name: 'alt',
          title: '图片描述 / Alt text',
          type: 'string',
          description: '一句话描述画面内容，给读屏软件和搜索引擎用，例如「羚羊峡谷里的一束正午光」。',
        }),
      ],
    }),
    defineField({
      name: 'places',
      title: '相关章节 / Places',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'collection'}]})],
      description:
        '这篇笔记写的是哪几章（地点）。文章页会把它们显示成对应颜色的票根标签，并链接到那一章的故事页。可以不选。',
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'body',
      title: '正文 / Body',
      type: 'array',
      description:
        '正文。段落直接写；小标题用 H2 / H3；引用别人的话用 Quote；插入照片用 + 里的 Image；想把自己的一句话放大当"金句"用 + 里的 Pull quote。强调（I 按钮）：英文显示为斜体，中文没有斜体，显示为字下的着重号。最后一段请以正文段落结束，文末会自动加上结束符号 ■。',
      of: [
        defineArrayMember({
          type: 'block',
          styles: [
            {title: '正文 Normal', value: 'normal'},
            {title: '小标题 H2', value: 'h2'},
            {title: '小小标题 H3', value: 'h3'},
            {title: '引用 Quote', value: 'blockquote'},
          ],
          lists: [],
          marks: {
            decorators: [
              {title: '加粗 Strong', value: 'strong'},
              {title: '强调 Emphasis（英文斜体 · 中文着重号）', value: 'em'},
            ],
            annotations: [
              defineArrayMember({
                name: 'link',
                title: '链接 Link',
                type: 'object',
                fields: [
                  defineField({
                    name: 'href',
                    title: '网址 URL',
                    type: 'url',
                    description: '完整网址（https://…）或站内路径（例如 /works/miami）',
                    validation: (rule) =>
                      rule.required().uri({allowRelative: true, scheme: ['http', 'https', 'mailto']}),
                  }),
                ],
              }),
            ],
          },
        }),
        defineArrayMember({
          name: 'image',
          title: '照片 Image',
          type: 'image',
          options: {hotspot: true},
          fields: [
            defineField({
              name: 'caption',
              title: '图注 / Caption',
              type: 'string',
              description: '显示在照片下方的一句话（可选）。',
            }),
            defineField({
              name: 'alt',
              title: '图片描述 / Alt text',
              type: 'string',
              description: '描述画面内容，给读屏软件和搜索引擎用。',
            }),
          ],
        }),
        defineArrayMember({
          name: 'pullQuote',
          title: '金句 / Pull quote',
          type: 'object',
          fields: [
            defineField({
              name: 'text',
              title: '内容 / Text',
              type: 'text',
              rows: 3,
              description:
                '会被放大显示在正文中间的一句话，通常摘自这篇文章本身。不用加引号，网页会自动加。建议英文 120 字符、中文 40 字以内；放在离原句至少隔一段的位置（不要紧挨着原句）。',
              validation: (rule) => [
                rule.required().max(240),
                rule
                  .custom((value) => (tooLong(value, 40, 120) ? '金句建议英文 120 字符、中文 40 字以内；放在离原句至少隔一段的位置' : true))
                  .warning(),
              ],
            }),
            defineField({
              name: 'attribution',
              title: '出处 / Attribution (可选)',
              type: 'string',
              description: '如果是别人说的话，写上是谁；自己的话留空。',
            }),
          ],
          preview: {
            select: {title: 'text', subtitle: 'attribution'},
            prepare({title, subtitle}) {
              return {title: title ? `“${title}”` : '金句', subtitle: subtitle || 'Pull quote'}
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'featured',
      title: '在 About 页引用 / Featured on About',
      type: 'boolean',
      description: '勾选后，About 页中间的 Notes 预告会引用这一篇的导语（没有导语时用标题），并链接到这篇文章。只需要勾一篇；勾了多篇时用日期最新的一篇，一篇都没勾时用最新发布的一篇。',
      initialValue: false,
    }),
  ],
  orderings: [
    {
      title: '发布日期（新 → 旧）',
      name: 'publishedAtDesc',
      by: [{field: 'publishedAt', direction: 'desc'}],
    },
    {
      title: '发布日期（旧 → 新）',
      name: 'publishedAtAsc',
      by: [{field: 'publishedAt', direction: 'asc'}],
    },
  ],
  preview: {
    select: {title: 'title', publishedAt: 'publishedAt', media: 'cover', featured: 'featured'},
    prepare({title, publishedAt, media, featured}) {
      const date = typeof publishedAt === 'string' ? publishedAt.slice(0, 10) : '未设日期'
      return {
        title: title || '（无标题）',
        subtitle: featured ? `${date} · About 引用` : date,
        media,
      }
    },
  },
})
