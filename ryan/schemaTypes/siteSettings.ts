import {defineField, defineType} from 'sanity'

/**
 * Site Settings — 全站单例文档
 * 管理头像、个人简介、联系方式等全局信息
 * 在 Sanity Studio 中只需创建一条记录
 */
export default defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  // 所有「· 中文」字段也集中在「中文」这一页。
  groups: [{name: 'zh', title: '中文'}],
  // 单例配置：在 Studio 的预览中始终显示固定标题
  preview: {
    prepare() {
      return {
        title: 'Site Settings',
        subtitle: '全站配置 — 头像、简介、联系方式',
      }
    },
  },
  fields: [
    // ─── 个人信息 ───
    defineField({
      name: 'avatar',
      title: 'Avatar / Profile Photo',
      type: 'image',
      options: {hotspot: true},
      description: '你的头像，显示在 About 区域的 Blob 动画容器里',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'name',
      title: 'Display Name',
      type: 'string',
      description: 'e.g. "Ryan Xu"',
      initialValue: 'Ryan Xu',
    }),
    defineField({
      name: 'bio',
      title: 'Short Bio',
      type: 'text',
      rows: 3,
      description:
        'About 页的自我介绍。段落之间空一行。留空时网站用自带的那两段（"A photographic record of moving through cities…"）。注意：不要用这里的「新建」按钮去建这份文档，它会填进旧的默认文字；请让我们用接口建好。',
      initialValue:
        'Photographer based in New York. Capturing quiet moments where light meets intention. Shot on Nikon Zf — every frame is a conversation.',
    }),
    defineField({
      name: 'bioZh',
      title: '自我介绍 · 中文',
      type: 'text',
      rows: 6,
      group: 'zh',
      description: '中文版网站（右上角「中」）About 页的自我介绍，段落之间空一行。留空时显示我们先译好的中文草稿（只在英文还是网站自带那一版时）。',
    }),
    defineField({
      name: 'lede',
      title: 'Lede / About 页标题下的一句',
      type: 'string',
      description: '留空时用 "Cities and landscapes, one frame at a time."',
    }),
    defineField({
      name: 'ledeZh',
      title: 'About 页标题下的一句 · 中文',
      type: 'string',
      group: 'zh',
      description: '留空时用「城市与风景，一次一帧。」',
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline / 首页的一句话',
      type: 'string',
      description:
        '留空时用 "A personal archive of travel and thought."（开场影片的 ARCHIVE、TRAVEL、THOUGHT 三个词会飞进这句话，改写时请保留这三个词）。',
    }),
    defineField({
      name: 'taglineZh',
      title: '首页的一句话 · 中文',
      type: 'string',
      group: 'zh',
      description: '留空时用「一份关于旅行与思考的私人档案。」（改写时请保留「档案」「旅行」「思考」三个词）。',
    }),
    defineField({
      name: 'notesDek',
      title: 'Notes 导语',
      type: 'text',
      rows: 2,
      description: 'Notes 页标题下的一句。留空时用 "Reflections on the work and the journey behind it."',
    }),
    defineField({
      name: 'notesDekZh',
      title: 'Notes 导语 · 中文',
      type: 'text',
      rows: 2,
      group: 'zh',
      description: '留空时用「关于作品，也关于作品背后的那段旅程。」',
    }),
    defineField({
      name: 'particulars',
      title: 'Particulars / About 页的三行要点',
      type: 'array',
      description: '例如 Focus — Light. Geometry. Stillness. 留空时用网站自带的三行。',
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'term', title: '项目 / Term', type: 'string'}),
            defineField({name: 'termZh', title: '项目 · 中文', type: 'string'}),
            defineField({name: 'value', title: '内容 / Value', type: 'string'}),
            defineField({name: 'valueZh', title: '内容 · 中文', type: 'string'}),
          ],
          preview: {select: {title: 'term', subtitle: 'value'}},
        },
      ],
    }),

    // ─── 联系方式 ───
    defineField({
      name: 'email',
      title: 'Email Address',
      type: 'string',
      description: '联系邮箱',
      initialValue: 'hello@ryanxu.com',
    }),
    defineField({
      name: 'instagram',
      title: 'Instagram URL',
      type: 'url',
      description: 'Instagram 主页链接',
    }),

    // ─── 技能标签 ───
    defineField({
      name: 'skills',
      title: 'Skill Tags',
      type: 'array',
      of: [{type: 'string'}],
      description: '显示在头像下方的技能标签，每个标签一个小胶囊',
      options: {
        layout: 'tags',
      },
    }),

    // ─── 时间线 ───
    defineField({
      name: 'timeline',
      title: 'Journey Timeline',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'year', title: 'Year', type: 'string'}),
            defineField({name: 'title', title: 'Title', type: 'string'}),
            defineField({name: 'description', title: 'Description', type: 'text', rows: 2}),
          ],
          preview: {
            select: {title: 'title', subtitle: 'year'},
          },
        },
      ],
      description: 'About 页面右侧的时间线条目',
    }),
  ],
})
