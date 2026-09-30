// NOTES: the list (/notes) and the column page (/notes/<slug>). His notes
// themselves are content (Sanity `note`: title / titleZh, dek / dekZh,
// body / bodyZh …), and the list's dek is siteSettings.notesDek (siteText).

export const en = {
  // ── /notes ──
  'notes.title': 'Notes | Ryan',
  'notes.description': 'Notes by Ryan Xu — {dek}',
  'notes.descriptionEmpty': 'Notes by Ryan Xu.',
  'notes.runhead': 'The Notes',
  'notes.count': '{nn} notes',
  'notes.h1': 'Notes',
  'notes.listAria': 'Notes, newest first',
  /** The column's own number, on the list, the note and its turn. */
  'notes.number': 'No. {nn}',
  'notes.minRead': '{n} min read',
  /** Preview builds only (NOTES_SAMPLE=1): the sample note's label. */
  'notes.sample': '示例 · Sample',
  'notes.emptyAria': 'No notes yet',
  'notes.empty': 'Nothing has been filed here yet.',
  'notes.backToArchive': 'Back to the archive',

  // ── /notes/<slug> ──
  'note.descriptionFallback': 'A note by Ryan Xu.',
  'note.kicker': 'Notes',
  'note.credit.words': 'Words',
  'note.credit.filed': 'Filed',
  'note.credit.reading': 'Reading',
  'note.credit.minutes': '{n} min',
  'note.credit.status': 'Status',
  'note.credit.places': 'Places',
  'note.chapter.one': 'The chapter',
  'note.chapter.many': 'The chapters',
  'note.readStory': 'Read the story',
  'note.turnAria': 'More notes',
  'note.previous': 'Previous · No. {nn}',
  'note.next': 'Next · No. {nn}',
  'note.allNotes': 'All notes',
  'note.placeTagsAria': 'Places in this note',
  /** A photograph's alt when he wrote neither an alt nor a caption. */
  'note.photo': 'Photograph {nn}',
  'note.photoPlain': 'Photograph',
};

export const zh: Record<keyof typeof en, string> = {
  'notes.title': '笔记 | Ryan',
  'notes.description': 'Ryan Xu 的笔记——{dek}',
  'notes.descriptionEmpty': 'Ryan Xu 的笔记。',
  'notes.runhead': '笔记',
  'notes.count': '{nn} 篇笔记',
  'notes.h1': '笔记',
  'notes.listAria': '笔记，按时间由新到旧',
  'notes.number': '第 {nn} 篇',
  'notes.minRead': '阅读 {n} 分钟',
  'notes.sample': '示例',
  'notes.emptyAria': '暂无笔记',
  'notes.empty': '这里还没有归档任何笔记。',
  'notes.backToArchive': '回到档案',

  'note.descriptionFallback': 'Ryan Xu 的一篇笔记。',
  'note.kicker': '笔记',
  'note.credit.words': '文字',
  'note.credit.filed': '归档',
  'note.credit.reading': '阅读',
  'note.credit.minutes': '{n} 分钟',
  'note.credit.status': '状态',
  'note.credit.places': '地点',
  'note.chapter.one': '相关章节',
  'note.chapter.many': '相关章节',
  'note.readStory': '阅读故事',
  'note.turnAria': '更多笔记',
  'note.previous': '上一篇 · 第 {nn} 篇',
  'note.next': '下一篇 · 第 {nn} 篇',
  'note.allNotes': '全部笔记',
  'note.placeTagsAria': '本篇涉及的地点',
  'note.photo': '照片 {nn}',
  'note.photoPlain': '照片',
};
