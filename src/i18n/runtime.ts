// ── 中 / EN: the language on one URL ──
// The owner's decisions (2026-09-28): one URL, toggled in place (no /zh
// routes); his name stays "Ryan Xu"; route shields stay English; the map's
// own labels follow the toggle; we translate first and he edits later.
//
// How a page shows one language (the architecture, in one place):
//
//  1. BOTH languages are in the server's markup for every visible string —
//     <span data-l="en">Map</span><span data-l="zh" lang="zh-Hans">地图</span>
//     (src/i18n/react.tsx <T>, src/i18n/T.astro) — and global.css shows one:
//     html[data-lang="zh"] [data-l="en"] { display: none } and the reverse.
//     So the first paint is already in the reader's language (no flash of
//     English on a reload), React hydrates exactly the markup the server
//     sent (no #418: nothing about the language is decided during
//     hydration) and a toggle swaps every visible word at once, islands and
//     static Astro text alike, without a re-render and without touching a
//     running animation. Hidden spans are display:none, so a screen reader
//     reads one language.
//  2. The language itself is decided BEFORE the first paint, by the inline
//     script this module builds (langHeadScript, in Layout's <head>): it reads
//     localStorage and writes html[lang] (en | zh-Hans) and html[data-lang]
//     (en | zh), and the document title and description from their data-zh
//     twins. On an in-site arrival (Astro's ClientRouter) it writes the same
//     on the incoming document before the swap.
//  3. What cannot be two spans — an aria-label, an alt, a title attribute,
//     a string a script measures — is a string of ONE language. In an island
//     it comes from useT()/useLang(), whose server snapshot is 'en' (so
//     hydration matches) and which re-render into the stored language right
//     after; in static Astro markup it carries data-i18n-attrs and this
//     script sets it on DOMContentLoaded, after every swap and on a toggle.
//
// Everything here is pure; the inline script is built from these very
// functions (their source text), so scripts/i18n.test.mjs holds the shipped
// script to account.

export type Lang = 'en' | 'zh';

export const LANG_KEY = 'rx:lang';
/** Fired on window after a toggle (and after another tab toggles). */
export const LANG_EVENT = 'rx:langchange';

/** The value html[lang] carries in each language. */
export const HTML_LANG: Record<Lang, string> = { en: 'en', zh: 'zh-Hans' };

/** A stored value → a language ('en' unless it is exactly 'zh'). */
export function langOfValue(value: unknown): Lang {
  return value === 'zh' ? 'zh' : 'en';
}

/** Mark a document for a language: html[lang] and html[data-lang], its
 *  <title> and meta description from their data-en / data-zh twins (the
 *  English is kept as data-en the first time, so a toggle can go back), and
 *  every static attribute that carries data-i18n-attrs. Safe on a document
 *  that is not in the window yet (the ClientRouter's incoming page). */
export function markDocument(doc: Document, lang: Lang) {
  var root = doc.documentElement;
  root.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');
  root.setAttribute('data-lang', lang);
  var title = doc.querySelector('title');
  if (title) {
    if (!title.hasAttribute('data-en')) title.setAttribute('data-en', title.textContent || '');
    var nextTitle = title.getAttribute('data-' + lang);
    if (nextTitle != null && title.textContent !== nextTitle) title.textContent = nextTitle;
  }
  var metas = doc.querySelectorAll('meta[data-zh]');
  for (var i = 0; i < metas.length; i += 1) {
    var meta = metas[i];
    if (!meta.hasAttribute('data-en')) meta.setAttribute('data-en', meta.getAttribute('content') || '');
    var content = meta.getAttribute('data-' + lang);
    if (content != null) meta.setAttribute('content', content);
  }
  var nodes = doc.querySelectorAll('[data-i18n-attrs]');
  for (var j = 0; j < nodes.length; j += 1) {
    var node = nodes[j];
    var pairs: Record<string, Record<string, string>> | null = null;
    try {
      pairs = JSON.parse(node.getAttribute('data-i18n-attrs') || '');
    } catch (e) {
      pairs = null;
    }
    if (!pairs) continue;
    for (var name in pairs) {
      var value = pairs[name] && pairs[name][lang];
      if (typeof value === 'string' && node.getAttribute(name) !== value) node.setAttribute(name, value);
    }
  }
}

/** The stored language ('en' when nothing is stored or storage is denied). */
export function readStoredLang(storage: Pick<Storage, 'getItem'> | null | undefined): Lang {
  try {
    return langOfValue(storage ? storage.getItem(LANG_KEY) : null);
  } catch (e) {
    return 'en';
  }
}

const source = () =>
  `var LANG_KEY=${JSON.stringify(LANG_KEY)};` +
  `var LANG_EVENT=${JSON.stringify(LANG_EVENT)};` +
  `var langOfValue=${langOfValue.toString()};` +
  `var readStoredLang=${readStoredLang.toString()};` +
  `var markDocument=${markDocument.toString()};`;

/** Layout's <head> script (every page, after <title> and the description):
 *  the stored language on <html> before the first paint. Once per full load
 *  it also installs window.__rxLang — the one place a toggle goes through
 *  (src/i18n/lang.ts setLang calls it) — and the ClientRouter listeners:
 *  the incoming document is marked before it is swapped in, and its static
 *  attributes after. Another tab's toggle arrives by the storage event and is
 *  applied silently. */
export function langHeadScript() {
  return (
    '(function(){' +
    source() +
    'var store=null;try{store=window.localStorage;}catch(e){}' +
    'markDocument(document,readStoredLang(store));' +
    'if(window.__rxLang)return;' +
    'var api={' +
    'get:function(){return langOfValue(document.documentElement.getAttribute("data-lang"));},' +
    'set:function(lang,quiet){lang=langOfValue(lang);' +
    'try{if(store)store.setItem(LANG_KEY,lang);}catch(e){}' +
    'markDocument(document,lang);' +
    'try{window.dispatchEvent(new CustomEvent(LANG_EVENT,{detail:{lang:lang,quiet:!!quiet}}));}catch(e){}' +
    'return lang;}' +
    '};' +
    'window.__rxLang=api;' +
    "document.addEventListener('astro:before-swap',function(e){if(e&&e.newDocument)markDocument(e.newDocument,readStoredLang(store));});" +
    "document.addEventListener('astro:after-swap',function(){markDocument(document,readStoredLang(store));});" +
    "document.addEventListener('DOMContentLoaded',function(){markDocument(document,api.get());});" +
    "window.addEventListener('storage',function(e){if(e&&e.key===LANG_KEY){var next=langOfValue(e.newValue);if(next!==api.get()){markDocument(document,next);try{window.dispatchEvent(new CustomEvent(LANG_EVENT,{detail:{lang:next,quiet:true}}));}catch(err){}}}});" +
    '})();'
  );
}
