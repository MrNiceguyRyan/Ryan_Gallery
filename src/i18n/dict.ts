// ── The dictionary: every interface string, in both languages ──
// Keys are the ones the translation inventory uses (scratchpad wf26/zh
// strings.json: `nav.map`, `story.next`, …). en.ts is the source of truth for
// the key set; zh.ts must carry every key with the same {placeholders}
// (scripts/i18n.test.mjs). Prose that he writes — the stories, the bio, the
// notes — is content, not interface: it lives in Sanity (…Zh fields) with our
// drafts in src/i18n/content.ts.

import { en } from './en.ts';
import { zh } from './zh.ts';
import type { Lang } from './runtime.ts';

export type Key = keyof typeof en;
export type Vars = Record<string, string | number | null | undefined>;

export const DICT: Record<Lang, Record<Key, string>> = { en, zh };

/** `{name}` placeholders, in order of appearance. */
export function placeholders(text: string): string[] {
  return Array.from(text.matchAll(/\{(\w+)\}/g), (match) => match[1]);
}

/** One string in one language, its placeholders filled. A key missing from
 *  a language falls back to the English (never to the key). */
export function tr(lang: Lang, key: Key, vars?: Vars): string {
  const text = DICT[lang][key] ?? DICT.en[key] ?? String(key);
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value == null ? '' : String(value);
  });
}

/** Both languages of one string. */
export function both(key: Key, vars?: Vars): Record<Lang, string> {
  return { en: tr('en', key, vars), zh: tr('zh', key, vars) };
}

/** A static element's attribute in both languages, for Astro markup: the
 *  English is the attribute (what a page without JS keeps) and the pair rides
 *  in data-i18n-attrs, which the head script's markDocument applies.
 *  `{...i18nAttrs({ 'aria-label': 'notes.listAria' })}` */
export function i18nAttrs(map: Record<string, Key | Record<Lang, string>>, vars?: Vars): Record<string, string> {
  const out: Record<string, string> = {};
  const pairs: Record<string, Record<Lang, string>> = {};
  for (const [name, value] of Object.entries(map)) {
    const pair = typeof value === 'string' ? both(value as Key, vars) : value;
    out[name] = pair.en;
    pairs[name] = pair;
  }
  out['data-i18n-attrs'] = JSON.stringify(pairs);
  return out;
}

/** 'zh' text when there is some, else the English: the one read rule for a
 *  field with a Chinese twin (Sanity's …Zh, or our draft). */
export function pick(lang: Lang, enText: string, zhText: string | null | undefined): string {
  return lang === 'zh' && typeof zhText === 'string' && zhText.trim() ? zhText : enText;
}
