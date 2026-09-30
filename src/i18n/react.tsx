// ── 中 / EN in the React islands ──
// The API every island uses (see src/i18n/runtime.ts for the architecture):
//
//   <T k="story.next" />                visible text: both languages in the
//                                       markup, CSS shows one (no flash, no
//                                       hydration mismatch, no re-render on a
//                                       toggle)
//   <T k="story.frames" vars={{ n }} /> with {placeholders}
//   <Bi en={c.name} zh={c.nameZh} />    a content field with a Chinese twin
//   const t = useT();  t('story.closeAria')
//                                       a string of ONE language — for an
//                                       aria-label, alt, title, or a string a
//                                       script measures. 'en' while hydrating,
//                                       the reader's language right after, and
//                                       again on every toggle.
//   const lang = useLang();             the same, as 'en' | 'zh'
//
// Rule of thumb: a word the reader SEES is <T>/<Bi>; a word only a screen
// reader or a script reads is t(). Never branch markup structure on useLang()
// (the first client render is English by contract); branch text only.

import { Fragment, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { tr, pick, type Key, type Vars } from './dict.ts';
import { getLang, subscribeLang, type Lang } from './lang.ts';

const serverLang = (): Lang => 'en';

/** The reader's language: 'en' on the server and while hydrating (so the
 *  hydrated tree is the server's), then the stored one. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, serverLang);
}

/** t(key, vars) in the reader's language (see useLang for when). */
export function useT() {
  const lang = useLang();
  return useCallback((key: Key, vars?: Vars) => tr(lang, key, vars), [lang]);
}

/** A field with a Chinese twin, as one string (see useLang for when). */
export function usePick() {
  const lang = useLang();
  return useCallback((enText: string, zhText: string | null | undefined) => pick(lang, enText, zhText), [lang]);
}

/** Both languages of a visible string; CSS shows the reader's. Identical
 *  strings (a name, a figure) are printed once. */
export function Bi({ en, zh }: { en: ReactNode; zh?: ReactNode | null }) {
  const hasZh = zh != null && zh !== '' && !(typeof zh === 'string' && !zh.trim());
  if (!hasZh || (typeof en === 'string' && en === zh)) return <Fragment>{en}</Fragment>;
  return (
    <Fragment>
      <span data-l="en">{en}</span>
      <span data-l="zh" lang="zh-Hans">
        {zh}
      </span>
    </Fragment>
  );
}

/** A dictionary string, both languages in the markup. */
export function T({ k, vars }: { k: Key; vars?: Vars }) {
  return <Bi en={tr('en', k, vars)} zh={tr('zh', k, vars)} />;
}

/** A dictionary string with markup in it: each {slot} is filled, per
 *  language, by `slots[name](lang)` (plain {placeholders} come from `vars`).
 *  "A personal archive of {travel} and {thought}." with
 *  slots={{ travel: (l) => <em>{tr(l, 'explorer.idle.travel')}</em>, … }}.
 *  Both languages are in the markup, so a slot that carries a hook for a
 *  script (data-open-land, data-pass-from) is printed twice: find it with
 *  shownMatch() (src/i18n/lang.ts), never with a bare querySelector. */
export function TRich({ k, vars, slots }: { k: Key; vars?: Vars; slots: Record<string, (lang: Lang) => ReactNode> }) {
  const render = (lang: Lang) =>
    tr(lang, k, vars)
      .split(/(\{\w+\})/)
      .filter(Boolean)
      .map((piece, index) => {
        const slot = /^\{(\w+)\}$/.exec(piece)?.[1];
        return <Fragment key={index}>{slot && slots[slot] ? slots[slot](lang) : piece}</Fragment>;
      });
  return (
    <Fragment>
      <span data-l="en">{render('en')}</span>
      <span data-l="zh" lang="zh-Hans">
        {render('zh')}
      </span>
    </Fragment>
  );
}
