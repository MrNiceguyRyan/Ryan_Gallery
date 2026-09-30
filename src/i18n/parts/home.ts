// The homepage's words in files other tracks own this round (explorer,
// cover, entrance, pass, atlas, Index, film): drafted here so the follow-up
// pass only swaps code — see scratchpad wf44/D/REMAINING.md for each string's
// file, line and pattern. Generated from the inventory (wf44/D/inv,
// gen/home-part.mjs); edit freely from now on.
// Stays English and is NOT here: the route shields and their sign (the state
// letters, STOP / 06, the split-flap names), the film's typographic art, the
// pass's codes (RX 001, 01A).
// Rich strings carry {slots} the component fills with markup (TRich in
// src/i18n/react.tsx): {br} a line break, a landing word, an <em>.

export const en = {
  // ── components/home/HomePage.tsx ──
  // Skip link (focus-visible only).
  'home.skipToArchive': 'Skip to archive',
  // sr-only h1.
  'home.h1': 'Ryan Xu — Visual Archive',
  // Key reused from strings.json; its English changed ("back to top" → "back to the start"), so the zh changed too.
  'home.wordmarkAria': 'Ryan Xu — back to the start',
  // sr-only h2 (desktop). Replaces the old "Selected Works" heading (home.selectedWorks.*).
  'home.placesHeading': 'Places',
  // Idle rail kicker (nothing in hand); the year span after it is digits.
  'explorer.idle.kicker': 'Visual Archive',
  // Rich text: two <em> (Fraunces italic). Chinese has no italic — needs the owner's emphasis rule (weight/colour), and <T> must accept markup. Same sente
  'explorer.idle.line': 'A personal archive of {travel} and {thought}.',
  // The emphasised words of explorer.idle.line (an <em> in English; upright in Chinese).
  'explorer.idle.travel': 'travel',
  'explorer.idle.thought': 'thought',
  // {places} is zero-padded (padStart 2).
  'explorer.idle.figures': '{places} places · {frames} frames',
  // PROPOSED copy. {name} = recentrePlace.name (a RouteStop name → needs the Zh label).
  'explorer.idle.hintRecentre': 'Choose a shield on the map, or recentre on {name}.',
  // PROPOSED copy.
  'explorer.idle.hint': 'Choose a shield on the map, or step through below.',
  // The Index dialog (desktop).
  'explorer.index.aria': 'Index of the archive',
  // PROPOSED copy; the × is aria-hidden and stays.
  'explorer.index.close': 'Close index',

  // ── components/home/EntranceIntro.tsx ──
  // PROPOSED copy. Rendered at :374 (aria-hidden; the tear button carries the same words as its aria-label, BoardingPass.tsx:785). CSS uppercase (entrance
  'entrance.hint': 'Tear the stub to begin',
  // The entrance section's name.
  'entrance.aria': 'Opening',
  // sr-only role="status" (a live message, set when torn).
  'entrance.torn': 'The stub is torn off. Boarding.',

  // ── lib/boardingPass.ts ──
  // Owner asked for YOU on the pass (乘客写成 YOU): recommend keeping "YOU" in both languages. It is the landing field of the cover's "you" (data-pass-land="y
  'pass.value.passenger': 'YOU',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.value.from': 'HERE',
  // Only when there is no first chapter. PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger
  'pass.value.toFallback': 'THE ARCHIVE',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.value.boarding': 'NOW',
  // listJoin: ", " → "、" and " and " → "和" (no spaces). scripts/boarding-pass.test.mjs:210-211 assert the English joiner.
  'cover.listJoin': '{a}, {b} and {c}',
  // Cover kicker; the years piece after it stays digits and is the DATE flight source (EntranceIntro.tsx:337 data-pass-from="date" when it contains the fi
  'cover.kicker': 'Visual Archive',
  // PROPOSED copy. {ryan}/{xu}/{camera}/{travel} are landing slots (see the land words below and remaining-notes.md). ", a " holds a no-break space after 
  'cover.xl': '{ryan} {xu}, a {camera},{br}and the places I {travel}.',
  // Landing slot "camera" (text defaults to the land id: coverWords :287). In zh pass { land: 'camera', text: '相机' }. The film's CAMERA flies here (Openin
  'cover.land.camera': 'camera',
  // Landing slot "travel". The film's TRAVEL flies here.
  'cover.land.travel': 'travel',
  // plural() (:197) picks "place"/"frame" at 1 — Chinese has one form.
  'cover.figures': '{places} places. {frames} frames.',
  // Either part may be missing: regions only → "{regions}。", years only → "{years} 年。". {regions} = listJoin of the regions (content → regionZh: 佛罗里达州、亚利桑
  'cover.whereWhen': '{regions}, {years}.',
  // PROPOSED copy; {archive}/{thought} are landing slots.
  'cover.kept': 'What the camera kept became this {archive} — the light, the ground, and the {thought} that came along.',
  // Landing slot "archive". The film's ARCHIVE flies here.
  'cover.land.archive': 'archive',
  // Landing slot "thought". The film's THOUGHT flies here.
  'cover.land.thought': 'thought',
  // {to} = first chapter name (content → nameZh) and the TO flight source; {you} = landing slot. scripts/boarding-pass.test.mjs:187 asserts the English.
  'cover.firstStop': 'First stop, {to}. The passenger is {you}.',
  // Landing slot "you" — lands the film's YOU (selector `.entrance [data-open-land="you"]`) AND is the pass's PASSENGER flight source (EntranceIntro.tsx:1
  'cover.land.you': 'you',
  // When there is no first chapter. scripts/boarding-pass.test.mjs:205 asserts the English.
  'cover.passenger': 'The passenger is {you}.',

  // ── components/home/BoardingPass.tsx ──
  // Values are lowercased (.toLowerCase()) — harmless for Chinese. Translate even if the printed pass stays English (it is what a screen reader hears).
  'pass.aria': 'Boarding pass: passenger {passenger}, from {from} to {to}, flight {flight}, seat {seat}. Its QR code opens ryanxugallery.com.',
  'pass.roledescription': 'boarding pass',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.band': 'Boarding pass',
  // {flight} = "RX 001" (a code, stays). PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger
  'pass.band.flight': 'Flight {flight}',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.label.from': 'From',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.label.to': 'To',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.label.passenger': 'Passenger',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.label.flight': 'Flight',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.label.date': 'Date',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.label.gate': 'Gate',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.label.seat': 'Seat',
  // PROPOSED zh, but consider keeping the printed pass in English like the shields: the owner asked for the passenger to read "YOU" (乘客写成 YOU, boardingPas
  'pass.label.boarding': 'Boarding',
  'pass.qrAria': 'QR code: ryanxugallery.com',
  // The start button's name (PROPOSED). Same words as entrance.hint.
  'pass.tearAria': 'Tear the stub to begin',

  // ── components/home/ExplorerControls.tsx ──
  // scripts/explorer-arrival.test.mjs:113 asserts this source literal — update the test with the code.
  'explorer.prevAria': 'Previous place: {nn} {name}',
  // When there is no previous place (button disabled).
  'explorer.prev': 'Previous place',
  // scripts/explorer-arrival.test.mjs:113 asserts this source literal.
  'explorer.nextAria': 'Next place: {nn} {name}',
  'explorer.next': 'Next place',
  // {total} zero-padded here.
  'explorer.allAria.now': 'All places, {total}. Now {nn} {name}',
  // {total} zero-padded here.
  'explorer.allAria': 'All places, {total}',
  // Nothing in hand: "06 Places".
  'explorer.places': 'Places',
  // PROPOSED copy. (R) is the key shortcut (aria-keyshortcuts="R").
  'explorer.recentreAria.place': 'Recentre on {nn} {name} (R)',
  // PROPOSED copy.
  'explorer.recentreAria': 'Recentre (R)',
  // Tip; desktop appends " · R" (keep).
  'explorer.recentreTip.place': 'Recentre · {nn} {name}',
  // Tip.
  'explorer.recentreTip': 'Recentre',
  // scripts/explorer-arrival.test.mjs:113 asserts this source literal. contact sheet = 印样 (as in the film drafts).
  'explorer.indexAria': 'Index: the contact sheet',
  // Tip.
  'explorer.indexTip': 'Index',
  // The list dialog; {total} NOT padded here (unlike :148).
  'explorer.listAria': 'All places, {total}',
  'explorer.list.head': 'All places',
  // Joined after the region with " · ".
  'explorer.list.frames': '{frames} frames',
  // The bar's group name.
  'explorer.barAria': 'Places',

  // ── components/home/ArchiveChapter.tsx ──
  // Stub row label (the stub is aria-hidden). The label is also the React key (:2096 key={label}) — fine as long as labels stay distinct.
  'chapter.stub.region': 'Region',
  'chapter.stub.frames': 'Frames',
  'chapter.stub.year': 'Year',
  // Label only now (strings.json had label+value in one string).
  'chapter.stub.lat': 'Lat',
  // Hemisphere from the sign of the value; N/S → 北纬/南纬, E/W → 东经/西经, placed BEFORE the figure in Chinese.
  'coord.n': '{v}° N',
  // Hemisphere from the sign of the value; N/S → 北纬/南纬, E/W → 东经/西经, placed BEFORE the figure in Chinese.
  'coord.s': '{v}° S',
  'chapter.stub.long': 'Long',
  // Hemisphere from the sign of the value; N/S → 北纬/南纬, E/W → 东经/西经, placed BEFORE the figure in Chinese.
  'coord.e': '{v}° E',
  // Hemisphere from the sign of the value; N/S → 北纬/南纬, E/W → 东经/西经, placed BEFORE the figure in Chinese.
  'coord.w': '{v}° W',
  // Only when a collection has neither location nor region.
  'chapter.datelineFallback': 'United States',
  // Phone pill on the photograph (aria-hidden, lg:hidden).
  'chapter.hoverViewStory': 'View story',
  // The rail's control name. {name} → nameZh.
  'chapter.coverAria': 'View story: {name}',
  // The cue under/over the docked cover (aria-hidden). Its box is a CONSTANT sized to the English words: coverDock.ts:163 CUE.w = 96 px (route-avoidance m
  'chapter.openStory': 'Open story',
  // The stub's way on (aria-hidden stub; tabIndex -1).
  'chapter.nextStop': 'Next stop',
  'chapter.endOfRoute': 'End of the route',
  // The region tab over the cover (aria-hidden). coverDock.ts DOCK.tab = 34 px (its height, not its width) — unaffected.
  'chapter.stateTab.label': 'Region',
  // On the first place of a multi-place region.
  'chapter.stateTab.figures': '{places} places · {frames} frames',
  // Rail running head (CSS uppercase).
  'chapter.rail.chapter': 'Chapter {nn}',
  'chapter.rail.frames': '{frames} frames',
  // Only when there is neither a narrative excerpt nor a subtitle (none today).
  'chapter.rail.fallbackLede': 'A photographic dispatch from {dateline}.',

  // ── components/home/AtlasSign.tsx ──
  // Imperative textContent (t()). Same key at :400 and :457.
  'sign.km': '{km} KM',
  // The tick strip under the map.
  'sign.ticksAria': 'Chapters',
  // {n} not padded. {name} → nameZh.
  'sign.tickAria': 'Go to chapter {n}: {name}, {frames} frames',
  // Tick label (aria-hidden).
  'sign.tick.frames': ' · {frames} frames',
  // The map shield button's name. {name} → nameZh (the accessible name may be Chinese even though the shield prints English).
  'sign.shieldAria': 'Go to chapter {n}: {name}',

  // ── components/home/RouteAtlas.tsx ──
  // setAttribute on the Mapbox canvas (role="application") — a t() string inside an effect; re-run on a language switch.
  'atlas.canvasAria': 'Map of the archive. Arrow keys move it, plus and minus zoom. Each place is a shield.',
  // strings.json atlas.aria was the old "Scroll-driven photographic route".
  'atlas.sectionAria': 'The archive\'s map',
  // aria-live="polite" (:3867): shown when the map is slow to load.
  'atlas.delayed': 'Route signal delayed',
  // Desktop header (CSS uppercase).
  'atlas.header.route': 'The Route',
  'atlas.header.coords': 'Photographic coordinates',
  // sr-only aria-live. {name} → nameZh; {coords} from coord.*.
  'atlas.live.current': 'Current place: {name}. Coordinates {coords}',
  // sr-only aria-live, nothing in hand. (strings.json had "Route overview" here.)
  'atlas.live.whole': 'The whole map',

  // ── components/home/ArchiveClosing.tsx ──
  // The visual title, set line by line (aria-hidden, :591). Lines are React keys (:592, :818) and are measured in the hidden ruler (fitTitle :231) to size
  'closing.titleLines': 'Cities and / landscapes, / one frame / at a time.',
  // sr-only (:590). Same sentence as the About lede.
  'closing.title': 'Cities and landscapes, one frame at a time.',
  // Figure label; used as React key (:603, :810, :815) and measured in the ruler (:815) for the layout.
  'closing.fig.chapters': 'Chapters',
  'closing.fig.frames': 'Frames',
  'closing.fig.years': 'Years',
  // sr-only.
  'closing.sr.count': '{n} of {n} chapters.',
  'closing.done': 'Archive complete',
  'closing.everyFrame': '· Every frame, 01–{total}',
  // scripts/archive-entrance.test.mjs:62 matches /Back to the start/ in this file's source.
  'closing.backToStart': 'Back to the start ↑',
  'closing.about': 'About →',
  'closing.map': 'Map →',
  // {n} and {total} are zero-padded ("01", "06"). {place} → nameZh.
  'closing.stubAria': 'Open {place}, chapter {n} of {total}, {frames} frames',
  // Anchor caption (aria-hidden).
  'closing.loupe': 'Frame {nn} / {total}',

  // ── components/home/OpeningFilm.tsx ──
  // The one control while the film plays. The film itself (:2039) is aria-hidden.
  'film.skipAria': 'Skip the opening film',
  // The Skip pill (the → after it is aria-hidden). The head script only finds it by class (proofPlates.ts:122 `.of-skip`).
  'film.skip': 'Skip',
};

export const zh: Record<keyof typeof en, string> = {
  // ── components/home/HomePage.tsx ──
  'home.skipToArchive': '跳到档案',
  'home.h1': 'Ryan Xu — 影像档案',
  'home.wordmarkAria': 'Ryan Xu — 回到起点',
  'home.placesHeading': '地点',
  'explorer.idle.kicker': '影像档案',
  'explorer.idle.line': '一份关于{travel}与{thought}的私人档案。',
  'explorer.idle.travel': '旅行',
  'explorer.idle.thought': '思考',
  'explorer.idle.figures': '{places} 个地点 · {frames} 帧',
  'explorer.idle.hintRecentre': '在地图上选一块路牌，或回到{name}。',
  'explorer.idle.hint': '在地图上选一块路牌，或在下方逐站浏览。',
  'explorer.index.aria': '档案索引',
  'explorer.index.close': '关闭索引',

  // ── components/home/EntranceIntro.tsx ──
  'entrance.hint': '撕下票根即可开始',
  'entrance.aria': '开篇',
  'entrance.torn': '票根已撕下，正在登机。',

  // ── lib/boardingPass.ts ──
  'pass.value.passenger': '你',
  'pass.value.from': '此处',
  'pass.value.toFallback': '档案',
  'pass.value.boarding': '现在',
  'cover.listJoin': '{a}、{b}和{c}',
  'cover.kicker': '影像档案',
  'cover.xl': '{ryan} {xu}，一台{camera}，{br}和我{travel}过的地方。',
  'cover.land.camera': '相机',
  'cover.land.travel': '旅行',
  'cover.figures': '{places} 个地点。{frames} 帧。',
  'cover.whereWhen': '{regions}，{years} 年。',
  'cover.kept': '相机留下的，成了这份{archive}——光线、土地，以及一路相随的{thought}。',
  'cover.land.archive': '档案',
  'cover.land.thought': '思考',
  'cover.firstStop': '第一站，{to}。乘客是{you}。',
  'cover.land.you': '你',
  'cover.passenger': '乘客是{you}。',

  // ── components/home/BoardingPass.tsx ──
  'pass.aria': '登机牌：乘客 {passenger}，从{from}前往{to}，航班 {flight}，座位 {seat}。二维码指向 ryanxugallery.com。',
  'pass.roledescription': '登机牌',
  'pass.band': '登机牌',
  'pass.band.flight': '航班 {flight}',
  'pass.label.from': '出发',
  'pass.label.to': '到达',
  'pass.label.passenger': '乘客',
  'pass.label.flight': '航班',
  'pass.label.date': '日期',
  'pass.label.gate': '登机口',
  'pass.label.seat': '座位',
  'pass.label.boarding': '登机',
  'pass.qrAria': '二维码：ryanxugallery.com',
  'pass.tearAria': '撕下票根即可开始',

  // ── components/home/ExplorerControls.tsx ──
  'explorer.prevAria': '上一个地点：{nn} {name}',
  'explorer.prev': '上一个地点',
  'explorer.nextAria': '下一个地点：{nn} {name}',
  'explorer.next': '下一个地点',
  'explorer.allAria.now': '全部地点，共 {total} 个。当前 {nn} {name}',
  'explorer.allAria': '全部地点，共 {total} 个',
  'explorer.places': '地点',
  'explorer.recentreAria.place': '回到 {nn} {name}（R）',
  'explorer.recentreAria': '重新居中（R）',
  'explorer.recentreTip.place': '回到 · {nn} {name}',
  'explorer.recentreTip': '重新居中',
  'explorer.indexAria': '索引：印样',
  'explorer.indexTip': '索引',
  'explorer.listAria': '全部地点，共 {total} 个',
  'explorer.list.head': '全部地点',
  'explorer.list.frames': '{frames} 帧',
  'explorer.barAria': '地点',

  // ── components/home/ArchiveChapter.tsx ──
  'chapter.stub.region': '地区',
  'chapter.stub.frames': '帧数',
  'chapter.stub.year': '年份',
  'chapter.stub.lat': '纬度',
  'coord.n': '北纬 {v}°',
  'coord.s': '南纬 {v}°',
  'chapter.stub.long': '经度',
  'coord.e': '东经 {v}°',
  'coord.w': '西经 {v}°',
  'chapter.datelineFallback': '美国',
  'chapter.hoverViewStory': '查看故事',
  'chapter.coverAria': '查看故事：{name}',
  'chapter.openStory': '打开故事',
  'chapter.nextStop': '下一站',
  'chapter.endOfRoute': '路线终点',
  'chapter.stateTab.label': '地区',
  'chapter.stateTab.figures': '{places} 个地点 · {frames} 帧',
  'chapter.rail.chapter': '第 {nn} 章',
  'chapter.rail.frames': '{frames} 帧',
  'chapter.rail.fallbackLede': '一份来自{dateline}的影像通讯。',

  // ── components/home/AtlasSign.tsx ──
  'sign.km': '{km} 公里',
  'sign.ticksAria': '章节',
  'sign.tickAria': '前往第 {n} 章：{name}，{frames} 帧',
  'sign.tick.frames': ' · {frames} 帧',
  'sign.shieldAria': '前往第 {n} 章：{name}',

  // ── components/home/RouteAtlas.tsx ──
  'atlas.canvasAria': '档案地图。方向键移动地图，加号和减号缩放。每个地点都是一块路牌。',
  'atlas.sectionAria': '档案地图',
  'atlas.delayed': '路线信号延迟',
  'atlas.header.route': '路线',
  'atlas.header.coords': '摄影坐标',
  'atlas.live.current': '当前地点：{name}。坐标 {coords}',
  'atlas.live.whole': '全图',

  // ── components/home/ArchiveClosing.tsx ──
  'closing.titleLines': '城市与风景， / 一次一帧。',
  'closing.title': '城市与风景，一次一帧。',
  'closing.fig.chapters': '章节',
  'closing.fig.frames': '帧数',
  'closing.fig.years': '年份',
  'closing.sr.count': '共 {n} 章，已至第 {n} 章。',
  'closing.done': '档案完结',
  'closing.everyFrame': '· 每一帧，01–{total}',
  'closing.backToStart': '回到起点 ↑',
  'closing.about': '关于 →',
  'closing.map': '地图 →',
  'closing.stubAria': '打开{place}，第 {n} 章，共 {total} 章，{frames} 帧',
  'closing.loupe': '第 {nn} 帧 / {total}',

  // ── components/home/OpeningFilm.tsx ──
  'film.skipAria': '跳过开场影片',
  'film.skip': '跳过',
};
