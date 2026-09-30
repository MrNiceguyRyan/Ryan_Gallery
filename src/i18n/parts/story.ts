// The Collection Story (MagazineLayout: the homepage overlay and /works),
// its <head>, and the photo viewer (Lightbox).

export const en = {
  // ── /works <head> (the English is built in the page; these are the
  //    Chinese shapes, kept as pairs) ──
  'works.title': '{name} {year} | Ryan',
  'works.titleNoYear': '{name} | Ryan',
  'works.descriptionFallback': '{lead} — {n} photographs by Ryan Xu.',
  'works.descriptionPhotos': '{n} photographs by Ryan Xu.',

  // ── The running head ──
  'story.back': 'Back',
  'story.closeAria': 'Close {name} story',
  'story.backFromAria': 'Back from {name} story',
  'story.dialogAria': 'Story: {name}',

  // ── The opening spread ──
  'story.spreadAria': '{name}, opening',
  'story.credits.photographs': 'Photographs',
  'story.credits.camera': 'Camera',
  'story.credits.map': 'Map',
  'story.mapCredit': 'terraink.app · © OpenStreetMap contributors',

  // ── Frames ──
  'story.frameLabel': 'Frame {nn}',
  'story.frameOpenAria': 'Open {label}',
  'story.frameUnavailable': 'Frame unavailable',
  'story.framesSr': '{n} frames',

  // ── Sub-chapters (PROPOSED labels, storyChapters.ts) ──
  'story.contents': 'Contents',
  'story.part': 'Part',
  'story.partSr': 'Part {n}',
  'story.moreFrames': 'More frames',

  // ── The kept stub (its sign — shield, STOP / 06, the name — stays
  //    English, as the road signs do) ──
  'story.stub.region': 'Region',
  'story.stub.year': 'Year',
  'story.stub.frame': 'Frame',

  // ── The end page ──
  'story.plates': 'Plates',
  'story.plateAria': 'Open frame {nn}',
  'story.mapAlt': 'Map of {name}',
  'story.facts.place': 'Place',
  'story.facts.position': 'Position',
  'story.facts.year': 'Year',
  'story.facts.frames': 'Frames',
  'story.facts.camera': 'Camera',
  'story.facts.photographs': 'Photographs',
  'story.nextAria': 'Read next story: {name}',
  'story.next': 'Next,',
  'story.share': 'Share this story',
  'story.shared': 'Link copied',
  'story.backToOpening': 'Back to the opening',
  'story.linkAria': 'Story link — select and copy',
  'story.shareTitle': 'Ryan Xu | {name}',
  'story.status.shared': 'Story shared.',
  'story.status.copied': 'Link copied to clipboard.',
  'story.status.manual': 'Unable to copy automatically. Select the link below to copy it.',

  // ── The photo viewer ──
  'lightbox.aria': 'Photo viewer, {name}',
  'lightbox.ariaPlain': 'Photo viewer',
  'lightbox.showing': 'Showing {label}',
  'lightbox.closeAria': 'Close photo viewer',
  'lightbox.frameUnavailable': 'Frame unavailable',
  'lightbox.prevAria': 'Previous photo, {n} of {total}',
  'lightbox.nextAria': 'Next photo, {n} of {total}',
  'lightbox.failed': 'Frame {n} could not load.',
  'lightbox.retry': 'Retry',
  'lightbox.preparing': 'Preparing frame {n}…',
  'photo.position': 'Photo {n} of {total}',
};

export const zh: Record<keyof typeof en, string> = {
  'works.title': '{name} {year} | Ryan',
  'works.titleNoYear': '{name} | Ryan',
  'works.descriptionFallback': '{lead}——Ryan Xu 拍摄的 {n} 张照片。',
  'works.descriptionPhotos': 'Ryan Xu 拍摄的 {n} 张照片。',

  'story.back': '返回',
  'story.closeAria': '关闭{name}的故事',
  'story.backFromAria': '从{name}的故事返回',
  'story.dialogAria': '故事：{name}',

  'story.spreadAria': '{name}，开篇',
  'story.credits.photographs': '摄影',
  'story.credits.camera': '相机',
  'story.credits.map': '地图',
  'story.mapCredit': 'terraink.app · © OpenStreetMap 贡献者',

  'story.frameLabel': '第 {nn} 帧',
  'story.frameOpenAria': '打开{label}',
  'story.frameUnavailable': '这一帧无法显示',
  'story.framesSr': '{n} 帧',

  'story.contents': '目录',
  'story.part': '部分',
  'story.partSr': '第 {n} 部分',
  'story.moreFrames': '更多照片',

  'story.stub.region': '地区',
  'story.stub.year': '年份',
  'story.stub.frame': '帧',

  'story.plates': '图版',
  'story.plateAria': '打开第 {nn} 帧',
  'story.mapAlt': '{name}地图',
  'story.facts.place': '地点',
  'story.facts.position': '位置',
  'story.facts.year': '年份',
  'story.facts.frames': '帧数',
  'story.facts.camera': '相机',
  'story.facts.photographs': '摄影',
  'story.nextAria': '阅读下一个故事：{name}',
  'story.next': '下一篇，',
  'story.share': '分享这个故事',
  'story.shared': '链接已复制',
  'story.backToOpening': '回到开篇',
  'story.linkAria': '故事链接——选中即可复制',
  'story.shareTitle': 'Ryan Xu | {name}',
  'story.status.shared': '故事已分享。',
  'story.status.copied': '链接已复制到剪贴板。',
  'story.status.manual': '无法自动复制。请选中下方的链接手动复制。',

  'lightbox.aria': '照片查看器，{name}',
  'lightbox.ariaPlain': '照片查看器',
  'lightbox.showing': '正在显示：{label}',
  'lightbox.closeAria': '关闭照片查看器',
  'lightbox.frameUnavailable': '这一帧无法显示',
  'lightbox.prevAria': '上一张，第 {n} 张，共 {total} 张',
  'lightbox.nextAria': '下一张，第 {n} 张，共 {total} 张',
  'lightbox.failed': '第 {n} 帧加载失败。',
  'lightbox.retry': '重试',
  'lightbox.preparing': '正在准备第 {n} 帧…',
  'photo.position': '第 {n} 张，共 {total} 张',
};
