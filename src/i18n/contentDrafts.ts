// ── Our Chinese drafts of his content (generated — do not hand-edit) ──
// From the translation inventory (scratchpad wf26/zh/content.json, drafted
// 2026-09-28): every Sanity field a Chinese page needs, keyed by the
// collection's _id. "我先译，你来改": these are OUR drafts. The site reads a
// field's Chinese from Sanity first (…Zh, once he has written or pasted it
// there), then from here, then falls back to the English — and a draft is
// used only while the English it translates is still the English on the page
// (src/i18n/content.ts), so a rewrite of his never shows a stale translation.
// Regenerate: node scratchpad/wf44/D/gen/drafts.mjs

export interface TextDraft {
  en: string;
  zh: string;
}

export interface ParagraphsDraft {
  en: string[];
  zh: string[];
}

export interface CollectionDraft {
  slug: string;
  name?: TextDraft;
  subtitle?: TextDraft;
  location?: TextDraft;
  region?: TextDraft;
  description?: TextDraft;
  introduction?: ParagraphsDraft;
  dek?: TextDraft;
  pullQuote?: TextDraft;
}

export const COLLECTION_DRAFTS: Record<string, CollectionDraft> = {
  "PzEfpaLkt8k6GZZDOijJrW": {
    "slug": "miami",
    "name": {
      "en": "Miami",
      "zh": "迈阿密"
    },
    "subtitle": {
      "en": "Miami, United States",
      "zh": "美国迈阿密"
    },
    "location": {
      "en": "Miami",
      "zh": "迈阿密"
    },
    "region": {
      "en": "Florida",
      "zh": "佛罗里达州"
    },
    "description": {
      "en": "A visual journey through Miami.",
      "zh": "一段穿行迈阿密的影像之旅。"
    },
    "introduction": {
      "en": [
        "Ocean Drive at dusk exists in two registers simultaneously: the pastel geometry of Art Deco facades going soft in the last natural light, and the neon beginning its slow assertion against the darkening sky. The sidewalk retains the day's heat long after the sun has gone.",
        "South Beach operates on a logic of surfaces — the gloss of a rental car hood, reflections in hotel lobby glass, the particular turquoise of the Atlantic at noon when the sand below is still visible and the water seems lit from within."
      ],
      "zh": [
        "黄昏时的海洋大道同时活在两个声部里：装饰艺术风格立面的粉彩几何，在最后的天光里变得柔和；霓虹则开始在渐暗的天色里缓缓亮出自己。太阳落下很久之后，人行道仍存着白天的热度。",
        "南海滩遵循的是一种表面的逻辑——租来的车引擎盖上的光泽，酒店大堂玻璃里的倒影，正午大西洋那种特别的青绿：水下的沙仍看得见，海水像是从内部被照亮。"
      ]
    },
    "dek": {
      "en": "Ocean Drive holds pastel facades and the first glow of neon in the same frame.",
      "zh": "海洋大道把粉彩的立面和霓虹初亮的光，收进了同一帧画面。"
    },
    "pullQuote": {
      "en": "South Beach operates on a logic of surfaces",
      "zh": "南海滩遵循的是一种表面的逻辑"
    }
  },
  "681VAOQyjkPHlJkPl2qrF6": {
    "slug": "orlando",
    "name": {
      "en": "Orlando",
      "zh": "奥兰多"
    },
    "subtitle": {
      "en": "Orlando, United States",
      "zh": "美国奥兰多"
    },
    "location": {
      "en": "Orlando",
      "zh": "奥兰多"
    },
    "region": {
      "en": "Florida",
      "zh": "佛罗里达州"
    },
    "description": {
      "en": "A visual journey through Orlando.",
      "zh": "一段穿行奥兰多的影像之旅。"
    },
    "introduction": {
      "en": [
        "Florida afternoon light is relentless and democratic — it flattens shadows, bleaches signage, and turns every surface equally bright. In the parks it catches the spray of fountains in small prismatic bursts, indifferent to anything beneath it.",
        "Away from the spectacle, Orlando is a city of retention ponds and palm trees bending in afternoon thunderstorm wind while the pavement still steams. The transition between the engineered and the accidental happens fast here."
      ],
      "zh": [
        "佛罗里达午后的光毫不留情，又一视同仁——它压平阴影，晒褪招牌，让每一个表面都一样明亮。在乐园里，它接住喷泉的水雾，碎成一小簇一小簇棱镜般的光，对底下的一切都不在意。",
        "离开那些盛大的景观，奥兰多是一座由蓄水池和棕榈树组成的城市：午后雷雨的风压弯了棕榈，路面还在冒着热气。在这里，人工的与偶然的，转换只在一瞬之间。"
      ]
    },
    "dek": {
      "en": "Florida light holds spectacle and ordinary streets in the same bright register.",
      "zh": "佛罗里达的光，把盛大的景观和寻常街道放进同一种明亮里。"
    },
    "pullQuote": {
      "en": "The transition between the engineered and the accidental happens fast here",
      "zh": "在这里，人工的与偶然的，转换只在一瞬之间"
    }
  },
  "4356CayLMjUUkSc3XXA3BY": {
    "slug": "page",
    "name": {
      "en": "Page",
      "zh": "佩吉"
    },
    "subtitle": {
      "en": "Page, United States",
      "zh": "美国佩吉"
    },
    "location": {
      "en": "Page",
      "zh": "佩吉"
    },
    "region": {
      "en": "Arizona",
      "zh": "亚利桑那州"
    },
    "description": {
      "en": "A visual journey through Page.",
      "zh": "一段穿行佩吉的影像之旅。"
    },
    "introduction": {
      "en": [
        "Inside Antelope Canyon the sandstone narrows until sound itself seems muffled. The walls have been smoothed by centuries of flash floods into curves that read more like fabric than rock — ochre folding into deep burgundy wherever a shaft of noon light finds the floor.",
        "That light lasts minutes. It enters as a column, diffuse at the edges, and illuminates suspended dust so finely that the air appears solid. What remains is pure geological time rendered in color."
      ],
      "zh": [
        "在羚羊峡谷里，砂岩一路收窄，窄到连声音都像是被捂住了。几百年的山洪把岩壁磨成一道道曲线，看上去更像织物，而不像岩石——正午的一束光落到谷底的地方，赭黄便折进深深的酒红。",
        "那束光只停留几分钟。它以一道光柱的形态进来，边缘弥散，把悬浮的尘埃照得如此细密，空气仿佛成了实体。留下的，是以色彩显形的、纯粹的地质时间。"
      ]
    },
    "dek": {
      "en": "Inside Antelope Canyon, sandstone folds a few minutes of noon light into color.",
      "zh": "在羚羊峡谷里，砂岩把几分钟的正午光线，折成了色彩。"
    },
    "pullQuote": {
      "en": "That light lasts minutes",
      "zh": "那束光只停留几分钟"
    }
  },
  "4356CayLMjUUkSc3XXKoGG": {
    "slug": "zion-national-park",
    "name": {
      "en": "Zion",
      "zh": "锡安"
    },
    "subtitle": {
      "en": "Zion, United States",
      "zh": "美国锡安"
    },
    "location": {
      "en": "Zion",
      "zh": "锡安"
    },
    "region": {
      "en": "Utah",
      "zh": "犹他州"
    },
    "description": {
      "en": "A visual journey through Zion.",
      "zh": "一段穿行锡安的影像之旅。"
    },
    "introduction": {
      "en": [
        "The Virgin River runs cold and milky green through the canyon bottom, its sound constant and indifferent to the walls rising nearly a thousand meters on either side. In morning shadow the sandstone is the color of dried blood; by noon it goes copper.",
        "What Zion enforces is a reckoning with scale. A single wall of Navajo sandstone erases the horizon and replaces it with texture — cross-bedded strata reading like handwriting from some earlier world."
      ],
      "zh": [
        "维尔京河在谷底流过，冰冷，泛着乳白的绿，水声从不停歇，对两侧拔起近千米的岩壁漠不关心。清晨的阴影里，砂岩是干涸血迹的颜色；到了正午，它变成铜色。",
        "锡安逼人正视的，是尺度。一整面纳瓦霍砂岩的岩壁抹去了地平线，代之以纹理——交错的层理读起来，像是来自更早某个世界的手迹。"
      ]
    },
    "dek": {
      "en": "The Virgin River threads beneath sandstone walls that erase the horizon.",
      "zh": "维尔京河从砂岩峭壁下穿过，那些岩壁抹去了地平线。"
    },
    "pullQuote": {
      "en": "What Zion enforces is a reckoning with scale",
      "zh": "锡安逼人正视的，是尺度"
    }
  },
  "681VAOQyjkPHlJkPl2sa9Q": {
    "slug": "bryce-canyon-national-park",
    "name": {
      "en": "Bryce Canyon",
      "zh": "布莱斯峡谷"
    },
    "subtitle": {
      "en": "Bryce Canyon, United States",
      "zh": "美国布莱斯峡谷"
    },
    "location": {
      "en": "Bryce Canyon",
      "zh": "布莱斯峡谷"
    },
    "region": {
      "en": "Utah",
      "zh": "犹他州"
    },
    "description": {
      "en": "A visual journey through Bryce Canyon.",
      "zh": "一段穿行布莱斯峡谷的影像之旅。"
    },
    "introduction": {
      "en": [
        "The hoodoos at Bryce form a kind of frozen congregation — thousands of pink limestone spires standing close together, the tallest capped with harder dolomite that protected them while everything around eroded away. In fresh snow they are almost surreal.",
        "Sunrise on the rim produces the most compressed range of tone — deep blue shadow filling the canyon floor, the spires above catching first light in amber and rust, the sky at the horizon going briefly gold before the whole amphitheater normalizes."
      ],
      "zh": [
        "布莱斯的岩柱像一场凝固的集会——成千上万座粉色石灰岩尖塔紧挨着站立，最高的那些顶着更坚硬的白云岩，在周围的一切被侵蚀殆尽时护住了自己。落过新雪之后，它们几乎是超现实的。",
        "在峡谷边缘看日出，色调被压缩到最紧：深蓝的阴影灌满谷底，上方的尖塔以琥珀色和铁锈色接住第一缕光，地平线上的天空短暂地转为金色，随后整座圆形剧场般的峡谷恢复如常。"
      ]
    },
    "dek": {
      "en": "At sunrise, thousands of hoodoos move from blue shadow into amber light.",
      "zh": "日出时分，成千上万座岩柱从蓝色的阴影走进琥珀色的光里。"
    }
  },
  "0f6ee6e3-429b-4711-a40d-f1fc0c478edc": {
    "slug": "new-york-stories",
    "name": {
      "en": "New York",
      "zh": "纽约"
    },
    "subtitle": {
      "en": "Light and shadow in the city that never sleeps",
      "zh": "不夜城里的光与影"
    },
    "location": {
      "en": "New York, USA",
      "zh": "美国纽约"
    },
    "region": {
      "en": "New York",
      "zh": "纽约州"
    },
    "introduction": {
      "en": [
        "Manhattan light arrives sideways in the early hours, cutting between towers in long amber slabs that catch the steam rising from grates and the grime on fire escapes. By mid-morning the city is already hard-edged, every surface asserting itself.",
        "Dusk compresses the borough into silhouette: water towers against violet sky, headlights smearing the wet street into something almost painterly. There is no softness here, only different kinds of contrast."
      ],
      "zh": [
        "清晨，曼哈顿的光是斜着照进来的，在高楼之间切出一道道狭长的琥珀色光块，照亮从地面格栅升起的蒸汽，也照亮消防梯上的污垢。到了上午过半，城市已经棱角分明，每一个表面都在宣告自己的存在。",
        "黄昏把这一区压缩成剪影：水塔立在紫色的天空前，车灯把湿漉漉的街面抹开，几乎成了一幅画。这里没有柔和，只有不同种类的反差。"
      ]
    },
    "dek": {
      "en": "Early light cuts between Manhattan towers, revealing steam, steel, and the texture of the street.",
      "zh": "清晨的光在曼哈顿的楼宇之间切过，照出蒸汽、钢铁，和街道的肌理。"
    }
  }
};

/** A photograph's own place (photo.location.city) in Chinese. */
export const CITY_ZH: Record<string, string> = {
  "Page": "佩吉",
  "Orlando": "奥兰多",
  "Bryce Canyon": "布莱斯峡谷",
  "Zion": "锡安",
  "Miami": "迈阿密",
  "Manhattan": "曼哈顿",
  "Midtown": "中城"
};

/** A region (collection.region) in Chinese: the states carry 州, so the
 *  state never collides with its city (纽约州 / 纽约). */
export const REGION_ZH: Record<string, string> = {
  "Florida": "佛罗里达州",
  "Arizona": "亚利桑那州",
  "Utah": "犹他州",
  "New York": "纽约州"
};

export interface Particular {
  term: string;
  termZh: string;
  value: string;
  valueZh: string;
}

/** siteSettings: the About page's prose and the lines the site repeats. */
export const SITE_DRAFTS: {
  bio: ParagraphsDraft;
  lede: TextDraft;
  tagline: TextDraft;
  notesDek: TextDraft;
  particulars: Particular[];
} = {
  "bio": {
    "en": [
      "A photographic record of moving through cities and landscapes, from the high-contrast geometry of Manhattan to the geologic time of the American Southwest. No commissioned work, no client briefs. Frames selected on a slow timeline, organized by location, dated.",
      "Off the camera: engineering and AI research. The discipline of careful observation transfers between the two; both reward patience over output volume. This site is one node in a personal archive, not a portfolio for hire."
    ],
    "zh": [
      "一份穿行于城市与风景之间的影像记录：从曼哈顿高反差的几何，到美国西南部的地质时间。没有委托，没有客户的命题。照片在缓慢的时间里挑选，按地点整理，注明日期。",
      "相机之外：工程与 AI 研究。细致观察的功夫，在两者之间相通；两者回报的都是耐心，而不是产出的多少。这个网站是一份私人档案中的一个节点，不是承接委托的作品集。"
    ]
  },
  "lede": {
    "en": "Cities and landscapes, one frame at a time.",
    "zh": "城市与风景，一次一帧。"
  },
  "tagline": {
    "en": "A personal archive of travel and thought.",
    "zh": "一份关于旅行与思考的私人档案。"
  },
  "particulars": [
    {
      "term": "Focus",
      "termZh": "关注",
      "value": "Light. Geometry. Stillness.",
      "valueZh": "光。几何。静止。"
    },
    {
      "term": "Method",
      "termZh": "方法",
      "value": "One frame at a time. Real shutter, real exposure.",
      "valueZh": "一次一帧。真实的快门，真实的曝光。"
    },
    {
      "term": "Log",
      "termZh": "记录",
      "value": "Personal archive, selected frames only.",
      "valueZh": "私人档案，只收精选的照片。"
    }
  ],
  "notesDek": {
    "en": "Reflections on the work and the journey behind it.",
    "zh": "关于作品，也关于作品背后的那段旅程。"
  }
};
