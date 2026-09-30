// The Chinese dictionary (our translation; he edits it later — "我先译，你来改").
// Glossary: frame 帧 · chapter 章 (Chapter 03 → 第 03 章) · stop 站 ·
// story 故事 · archive 档案 · Visual Archive 影像档案 · Plates 图版 ·
// Region 地区 (values carry 州) · Notes 笔记 · km 公里. His name stays
// "Ryan Xu"; route shields stay English.

import * as core from './parts/core.ts';
import * as home from './parts/home.ts';
import * as story from './parts/story.ts';
import * as travel from './parts/travel.ts';
import * as about from './parts/about.ts';
import * as notes from './parts/notes.ts';
import type { en } from './en.ts';

export const zh: Record<keyof typeof en, string> = {
  ...core.zh,
  ...home.zh,
  ...story.zh,
  ...travel.zh,
  ...about.zh,
  ...notes.zh,
};
