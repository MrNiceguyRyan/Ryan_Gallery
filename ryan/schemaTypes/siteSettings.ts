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
      description: '一段简短的自我介绍，显示在头像下方',
      initialValue:
        'Photographer based in New York. Capturing quiet moments where light meets intention. Shot on Nikon Zf — every frame is a conversation.',
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
