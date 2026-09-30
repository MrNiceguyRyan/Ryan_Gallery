// /about: the contributor cover, the profile, the notes' line, the closing
// card, the correspondence ticket (ContactTicket) and the colophon. His prose
// (the bio, the lede, FOCUS / METHOD / LOG) is content: siteText() in
// src/i18n/content.ts, not here.

export const en = {
  // ── <head> ──
  'about.title': 'About | Ryan',
  'about.description': 'Photographic archive. Operator: Ryan Xu. Base: New York.',

  // ── The contributor cover ──
  'about.cover.sr': 'Opening the profile',
  'about.cover.skip': 'Skip entrance',
  'about.cover.masthead': 'The Journal Gallery',
  'about.cover.section': 'The Profile',
  'about.cover.kicker': 'Photographer',
  'about.cover.city': 'New York, NY',
  'about.cover.folio': 'Contributor',

  // ── The profile ──
  'about.runhead.lead': 'The Profile',
  'about.runhead.short': 'NY · 2023',
  'about.runhead.long': 'New York · Since 2023',
  'about.meta.role': 'Photographer',
  'about.meta.city': 'New York, NY',
  'about.meta.since': 'Since 2023',

  // ── The notes' line ──
  'about.notes.title': 'The notes',
  'about.notes.stamp': 'No. {nn} · {date}',
  'about.notes.more': 'Read the notes',
  /** The dek's link, for a screen reader: the note's title, then its dek. */
  'about.notes.linkAria': '{title}: {dek}',

  // ── The closing card: "Always chasing / the light." ──
  // Two lines; {chasing} and {light} are the marked words (Fraunces italic
  // in English, the Song face upright in Chinese); {light} is the card's
  // one lime.
  'about.signoff.line1': 'Always {chasing}',
  'about.signoff.chasing': 'chasing',
  'about.signoff.line2': 'the {light}',
  'about.signoff.light': 'light.',

  // ── The colophon and the foot ──
  'about.colophon.type': 'Type',
  'about.colophon.typeValue': 'Fraunces, Space Grotesk',
  'about.colophon.cameras': 'Cameras',
  'about.colophon.builtWith': 'Built with',
  'about.colophon.builtWithValue': 'Astro, React, Sanity and Mapbox GL, on Cloudflare Workers',
  'about.colophon.updated': 'Updated',
  'about.copyright': '© {year} {name}. All rights reserved.',

  // ── The correspondence ticket ──
  'contact.email.label': 'Email',
  'contact.email.aria': 'Email {email}',
  'contact.instagram.label': 'Instagram',
  // Printed on the card under the stub, revealed as it leaves.
  'contact.under.copied': 'Copied',
  'contact.under.selected': 'Selected',
  'contact.under.copiedSmall': 'Address on your clipboard',
  'contact.under.selectedSmall': 'Copy it from the ticket',
  'contact.under.again': 'Put it back',
  // The stub.
  'contact.stub.chapters': 'Chapters',
  'contact.stub.frames': 'Frames',
  'contact.stub.since': 'Since',
  'contact.stub.base': 'Base',
  'contact.stub.baseValue': 'New York',
  // For a screen reader: what the stub is and what taking it did.
  'contact.sr.stub': 'The stub: {chapters} chapters, {frames} frames. Tear it off to copy the email address.',
  'contact.sr.selected': 'The email address is selected on the ticket. Put a stub back.',
  'contact.sr.copied': 'Copied: the email address is on your clipboard. Put a stub back.',
  'contact.status.copied': 'Copied: {email} is on your clipboard.',
  'contact.status.manual': '{email} is selected on the ticket, ready to copy.',
  'contact.hint': 'Tear off the stub to copy the address',
};

export const zh: Record<keyof typeof en, string> = {
  'about.title': '关于 | Ryan',
  'about.description': '影像档案。主理人：Ryan Xu。常驻：纽约。',

  'about.cover.sr': '正在打开个人页',
  'about.cover.skip': '跳过开场',
  'about.cover.masthead': '日志画廊',
  'about.cover.section': '人物',
  'about.cover.kicker': '摄影师',
  'about.cover.city': '美国 · 纽约',
  'about.cover.folio': '供稿人',

  'about.runhead.lead': '人物',
  'about.runhead.short': '纽约 · 2023',
  'about.runhead.long': '纽约 · 始于 2023',
  'about.meta.role': '摄影师',
  'about.meta.city': '美国 · 纽约',
  'about.meta.since': '始于 2023',

  'about.notes.title': '笔记',
  'about.notes.stamp': '第 {nn} 篇 · {date}',
  'about.notes.more': '阅读笔记',
  'about.notes.linkAria': '{title}：{dek}',

  'about.signoff.line1': '永远在{chasing}',
  'about.signoff.chasing': '追逐',
  'about.signoff.line2': '那一束{light}。',
  'about.signoff.light': '光',

  'about.colophon.type': '字体',
  'about.colophon.typeValue': 'Fraunces、Space Grotesk；中文用系统的宋体与黑体',
  'about.colophon.cameras': '相机',
  'about.colophon.builtWith': '构建',
  'about.colophon.builtWithValue': 'Astro、React、Sanity 与 Mapbox GL，运行于 Cloudflare Workers',
  'about.colophon.updated': '更新于',
  'about.copyright': '© {year} {name}。保留所有权利。',

  'contact.email.label': '邮箱',
  'contact.email.aria': '发邮件至 {email}',
  'contact.instagram.label': 'Instagram',
  'contact.under.copied': '已复制',
  'contact.under.selected': '已选中',
  'contact.under.copiedSmall': '地址已在剪贴板上',
  'contact.under.selectedSmall': '请从票面上复制',
  'contact.under.again': '放回去',
  'contact.stub.chapters': '章节',
  'contact.stub.frames': '帧数',
  'contact.stub.since': '始于',
  'contact.stub.base': '常驻',
  'contact.stub.baseValue': '纽约',
  'contact.sr.stub': '票根：{chapters} 章，{frames} 帧。撕下它，即可复制邮箱地址。',
  'contact.sr.selected': '邮箱地址已在票面上选中。放回一张票根。',
  'contact.sr.copied': '已复制：邮箱地址已在你的剪贴板上。放回一张票根。',
  'contact.status.copied': '已复制：{email} 已在你的剪贴板上。',
  'contact.status.manual': '{email} 已在票面上选中，可以复制了。',
  'contact.hint': '撕下票根，复制地址',
};
