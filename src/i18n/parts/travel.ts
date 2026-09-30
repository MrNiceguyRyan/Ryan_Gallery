// /travel, the standalone map ("Mapping the Archive."): the page's head and
// masthead, the entry cover, the map (its marks, clusters, status pill,
// loading and error states, the phone sheet), the index rail and a chapter's
// ticket. Every key is under `travel.`. Place names are content (Sanity's
// …Zh twins, src/i18n/content.ts), not keys; the map's own basemap labels
// follow the toggle through src/lib/mapLanguage.ts.

export const en = {
  // ── <head> ──
  'travel.meta.title': 'Map | Ryan',
  'travel.meta.description': 'Geo-tagged photographic archive. Every frame placed on the map across the United States.',

  // ── The masthead (travel.astro) ──
  'travel.eyebrow': 'The Territory · Geographic Index',
  'travel.eyebrowFigures': '· {chapters} chapters · {frames} frames',
  // The headline; {accent} is the page's one lime word (travel.titleAccent).
  'travel.title': 'Mapping the {accent}',
  'travel.titleAccent': 'Archive.',
  // The edition's figures (masthead legend, the phone sheet's peek line); the
  // years are appended as figures.
  'travel.legend': '{chapters} chapters · {frames} frames',
  'travel.mapAria': 'Interactive photographic atlas',

  // ── The entry cover (TravelEntryCover.tsx) ──
  'travel.cover.status': 'Opening the photographic atlas',
  'travel.cover.skip': 'Skip entrance',
  'travel.cover.masthead': 'The Journal Gallery',
  'travel.cover.section': 'The Territory',
  'travel.cover.kicker': 'Photographic Archive',
  'travel.cover.title': 'Atlas',
  'travel.cover.sub': 'Geographic Index',
  'travel.cover.live': 'Live Atlas',
  'travel.cover.figures': '{chapters} chapters / {frames} frames',

  // ── The map (MapboxMap.tsx) ──
  'travel.map.error.title': 'Atlas unavailable',
  'travel.map.error.body': 'The geographic archive could not be drawn.',
  'travel.map.error.retry': 'Retry atlas',
  'travel.map.offline.title': 'Atlas offline',
  'travel.map.offline.body': 'Map access is not available in this build.',
  'travel.map.empty.title': 'No coordinates yet',
  'travel.map.empty.body': 'New photographic locations will appear here.',
  'travel.map.returnHome': 'Return home',
  // A cluster's name: its region, the Southwest (Utah and Arizona together),
  // or, for a mix, this.
  'travel.map.cluster.southwest': 'Southwest',
  'travel.map.cluster.locations': 'Locations',
  'travel.map.clusterAria': 'Explore {label} cluster, {count} locations',
  'travel.map.placeAria': 'Explore {city}, {frames} frames',
  // The status pill over the map (desktop).
  'travel.map.status.select': 'Select a city or marker',
  'travel.map.status.viewing': 'Viewing {name}',
  'travel.map.hint': 'Drag to move · Scroll to zoom',
  'travel.map.loading.charting': 'Charting the archive',
  'travel.map.loading.frames': '{n} geotagged frames',
  'travel.map.loading.tilesFailed': 'Map tiles could not be loaded',
  'travel.map.retry': 'Retry map',
  'travel.map.resetView': 'Reset view',
  // The phone sheet.
  'travel.map.sheetAria': 'Atlas index',
  'travel.map.sheet.open': 'Open',
  'travel.map.sheet.close': 'Close',
  'travel.map.sheet.closeAria': 'Close {name}',
  'travel.map.sheet.liveOpen': '{name} open',
  'travel.map.sheet.liveIndexOpen': 'Index open',
  'travel.map.sheet.liveIndexClosed': 'Index collapsed',
  'travel.map.railAria': 'Index of chapters',
  // Mapbox's own controls (its English defaults, renamed in Chinese).
  'travel.map.ctrl.zoomIn': 'Zoom in',
  'travel.map.ctrl.zoomOut': 'Zoom out',
  'travel.map.ctrl.attribution': 'Toggle attribution',
  'travel.map.ctrl.logo': 'Mapbox homepage',
  'travel.map.ctrl.canvas': 'Map',

  // ── The index (TravelIndex.tsx; "Index" is also the phone sheet's) ──
  'travel.index': 'Index',
  // The column of the chapters' frame numbers in the issue (01–15).
  'travel.index.frames': 'Frames',
  'travel.index.route': 'Route · {n} chapters',
  'travel.index.km': '{km} km',

  // ── A chapter's ticket (TravelTicket.tsx) ──
  'travel.ticket.aria': 'Open the {name} story, chapter {n} of {total}',
  'travel.ticket.of': '/ {total} · Admission',
  'travel.ticket.region': 'Region',
  'travel.ticket.frames': 'Frames',
  'travel.ticket.year': 'Year',
  'travel.ticket.open': 'Open the story',

  // ── Figures lines (src/lib/travelSilver.ts) ──
  'travel.frames.one': '{n} frame',
  'travel.frames.other': '{n} frames',
  'travel.places': '{n} places',
  // A coordinate's halves (the stub prints "25.76° N · 80.19° W").
  'travel.coord.n': '{v}° N',
  'travel.coord.s': '{v}° S',
  'travel.coord.e': '{v}° E',
  'travel.coord.w': '{v}° W',
};

export const zh: Record<keyof typeof en, string> = {
  'travel.meta.title': '地图 | Ryan',
  'travel.meta.description': '带地理标记的影像档案。每一帧，都落在美国地图上它被拍下的地方。',

  'travel.eyebrow': '疆域 · 地理索引',
  'travel.eyebrowFigures': '· {chapters} 章 · {frames} 帧',
  'travel.title': '为{accent}制图。',
  'travel.titleAccent': '档案',
  'travel.legend': '{chapters} 章 · {frames} 帧',
  'travel.mapAria': '可交互的摄影地图集',

  'travel.cover.status': '正在打开摄影地图集',
  'travel.cover.skip': '跳过开场',
  'travel.cover.masthead': '日志画廊',
  'travel.cover.section': '疆域',
  'travel.cover.kicker': '摄影档案',
  'travel.cover.title': '地图集',
  'travel.cover.sub': '地理索引',
  'travel.cover.live': '实时地图集',
  'travel.cover.figures': '{chapters} 章 / {frames} 帧',

  'travel.map.error.title': '地图集暂不可用',
  'travel.map.error.body': '地理档案未能绘制。',
  'travel.map.error.retry': '重新加载地图集',
  'travel.map.offline.title': '地图集离线',
  'travel.map.offline.body': '此版本无法访问地图。',
  'travel.map.empty.title': '暂无坐标',
  'travel.map.empty.body': '新的拍摄地点会出现在这里。',
  'travel.map.returnHome': '返回首页',
  'travel.map.cluster.southwest': '西南部',
  'travel.map.cluster.locations': '地点',
  'travel.map.clusterAria': '展开{label}，共 {count} 个地点',
  'travel.map.placeAria': '查看{city}，{frames} 帧',
  'travel.map.status.select': '选择城市或标记',
  'travel.map.status.viewing': '正在查看{name}',
  'travel.map.hint': '拖动平移 · 滚动缩放',
  'travel.map.loading.charting': '正在绘制档案',
  'travel.map.loading.frames': '带地理标记的 {n} 帧',
  'travel.map.loading.tilesFailed': '地图瓦片未能加载',
  'travel.map.retry': '重新加载地图',
  'travel.map.resetView': '重置视图',
  'travel.map.sheetAria': '地图集索引',
  'travel.map.sheet.open': '展开',
  'travel.map.sheet.close': '收起',
  'travel.map.sheet.closeAria': '关闭{name}',
  'travel.map.sheet.liveOpen': '已打开{name}',
  'travel.map.sheet.liveIndexOpen': '索引已展开',
  'travel.map.sheet.liveIndexClosed': '索引已收起',
  'travel.map.railAria': '章节索引',
  'travel.map.ctrl.zoomIn': '放大',
  'travel.map.ctrl.zoomOut': '缩小',
  'travel.map.ctrl.attribution': '显示或隐藏版权信息',
  'travel.map.ctrl.logo': 'Mapbox 主页',
  'travel.map.ctrl.canvas': '地图',

  'travel.index': '索引',
  'travel.index.frames': '帧号',
  'travel.index.route': '路线 · {n} 章',
  'travel.index.km': '{km} 公里',

  'travel.ticket.aria': '打开{name}的故事，第 {n} 章，共 {total} 章',
  'travel.ticket.of': '/ {total} · 入场券',
  'travel.ticket.region': '地区',
  'travel.ticket.frames': '帧数',
  'travel.ticket.year': '年份',
  'travel.ticket.open': '打开故事',

  'travel.frames.one': '{n} 帧',
  'travel.frames.other': '{n} 帧',
  'travel.places': '{n} 个地点',
  'travel.coord.n': '北纬 {v}°',
  'travel.coord.s': '南纬 {v}°',
  'travel.coord.e': '东经 {v}°',
  'travel.coord.w': '西经 {v}°',
};
