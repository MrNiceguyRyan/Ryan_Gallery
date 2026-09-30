// ── The reader's language, on the client ──
// The truth is html[data-lang], written before the first paint by Layout's
// head script (src/i18n/runtime.ts) and changed only through setLang, which
// goes through the script's window.__rxLang (so the static page and the
// islands can never disagree). On the server there is no reader: 'en'.

import { LANG_EVENT, LANG_KEY, langOfValue, markDocument, type Lang } from './runtime.ts';

export type { Lang } from './runtime.ts';

interface LangApi {
  get(): Lang;
  set(lang: Lang, quiet?: boolean): Lang;
}

declare global {
  interface Window {
    __rxLang?: LangApi;
  }
}

/** The language on the page now ('en' on the server). */
export function getLang(): Lang {
  if (typeof document === 'undefined') return 'en';
  return langOfValue(document.documentElement.getAttribute('data-lang'));
}

/** Switch the page to a language: stored, marked on <html> (every both-
 *  language string swaps by CSS at once), the static attributes and the
 *  title set, and every island's useLang() told. */
export function setLang(lang: Lang): Lang {
  if (typeof window === 'undefined') return 'en';
  if (window.__rxLang) return window.__rxLang.set(lang);
  // No head script (a test page, an embed): do the same by hand.
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Storage denied: the page still switches; the next load is English.
  }
  markDocument(document, lang);
  window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: { lang, quiet: false } }));
  return lang;
}

/** The first match that is on screen in the page's language. A string that
 *  is printed in both languages (src/i18n/react.tsx) prints any hook it
 *  carries twice, and the hidden one has no box: a script that looks an
 *  element up by attribute to measure or animate it takes the shown one. */
export function shownMatch<T extends Element = HTMLElement>(root: ParentNode, selector: string): T | null {
  const all = root.querySelectorAll<T>(selector);
  for (const element of all) if (element.getClientRects().length > 0) return element;
  return all[0] ?? null;
}

/** Be told when the language changes (a toggle here, or in another tab). */
export function subscribeLang(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(LANG_EVENT, listener);
  return () => window.removeEventListener(LANG_EVENT, listener);
}
