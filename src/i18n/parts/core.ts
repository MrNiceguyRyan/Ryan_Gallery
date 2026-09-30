// Every page: the document's head, the nav and its language control, the
// skip link, the 404.

export const en = {
  // ── <head> ──
  'meta.defaultTitle': 'Ryan | Visual Archive',
  'meta.defaultDescription': 'A curated collection of photographic moments — shot on Nikon Zf, engineered with intention.',
  'meta.siteName': 'Ryan Xu | Visual Archive',
  'meta.titleSuffix': '{title} | Ryan',
  'a11y.skipToContent': 'Skip to content',
  'print.watermark': '© Ryan Xu · ryanxugallery.com — viewing copy, not for distribution.',
  'preview.buildStamp': 'Preview · build {stamp}',

  // ── The nav ──
  'nav.aria': 'Primary navigation',
  'nav.wordmarkAria': 'Ryan Xu — home',
  'nav.map': 'Map',
  'nav.notes': 'Notes',
  'nav.about': 'About',
  // The language control: one group, two options, each named in its own
  // language (a reader who cannot read the other one still finds his).
  'lang.group': 'Language',
  'lang.zh': '中',
  'lang.en': 'EN',
  'lang.zhName': '中文',
  'lang.enName': 'English',

  // ── 404 ──
  '404.title': 'Frame Not Found | Ryan',
  '404.description': 'The requested frame is not part of the Ryan Xu visual archive.',
  '404.navAria': 'Error page navigation',
  '404.home': 'Home',
  '404.kicker': '404 · Missing frame',
  '404.headline': 'This frame was never exposed.',
  '404.body': 'The address points outside the archive. Return to the index and continue from a known coordinate.',
  '404.return': 'Return to archive',
  '404.footer': 'Ryan Xu · Visual Archive',
};

export const zh: Record<keyof typeof en, string> = {
  'meta.defaultTitle': 'Ryan | 影像档案',
  'meta.defaultDescription': '一组精心挑选的摄影瞬间——以 Nikon Zf 拍摄，用心构建。',
  'meta.siteName': 'Ryan Xu | 影像档案',
  'meta.titleSuffix': '{title} | Ryan',
  'a11y.skipToContent': '跳到正文',
  'print.watermark': '© Ryan Xu · ryanxugallery.com — 仅供浏览，请勿传播。',
  'preview.buildStamp': '预览 · 构建 {stamp}',

  'nav.aria': '主导航',
  'nav.wordmarkAria': 'Ryan Xu — 首页',
  'nav.map': '地图',
  'nav.notes': '笔记',
  'nav.about': '关于',
  'lang.group': '语言',
  'lang.zh': '中',
  'lang.en': 'EN',
  'lang.zhName': '中文',
  'lang.enName': 'English',

  '404.title': '找不到这一帧 | Ryan',
  '404.description': '你要找的这一帧，不在 Ryan Xu 的影像档案里。',
  '404.navAria': '错误页导航',
  '404.home': '首页',
  '404.kicker': '404 · 缺失的一帧',
  '404.headline': '这一帧从未曝光。',
  '404.body': '这个地址指向档案之外。回到索引，从一个已知的坐标继续。',
  '404.return': '回到档案',
  '404.footer': 'Ryan Xu · 影像档案',
};
