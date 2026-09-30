import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { NOTES_LIVE } from '../lib/notesNav';
import { T, useLang, useT } from '../i18n/react';
import { setLang } from '../i18n/lang';
import type { Key } from '../i18n/dict';
import type { Lang } from '../i18n/runtime';

interface Props {
  currentPath: string;
  scrim?: boolean;
}

/* ── The nav set: MAP · NOTES · ABOUT │ 中 EN ──
   Owner, 2026-09-30: 右上角的三个按钮也可以优化一下，补充中英文按钮. The three
   pills become one slim instrument, the same object as the explorer's bar at
   the foot of the homepage (global.css .explorer-bar): bone on translucent
   olive, one hairline round it, Space Grotesk at 10px/500 and 0.08em, every
   target 40px (44px on the phone). The set never changes from page to page —
   the wordmark is Home — and the page the reader is on is printed in full
   bone over a hairline rule, as a printed contents line marks its page (no
   width of its own, so the set never shifts between pages; it fits a 360px
   phone with NOTES in it). The language is a switch in the same bar,
   after a hairline: its setting sits under a soft bone thumb that slides
   (320 ms, house arrive curve). No lime of its own: the keyboard's ring is
   the lime. NOTES only once a note is published (src/lib/notesNav). */
export const NAV_LINKS: Array<{ href: string; key: Key }> = [
  { href: '/travel', key: 'nav.map' },
  ...(NOTES_LIVE ? [{ href: '/notes', key: 'nav.notes' as Key }] : []),
  { href: '/about', key: 'nav.about' },
];

/** A path without its trailing slash (Astro's static build emits "/travel/"). */
export function normalPath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** 'page' on the page itself, 'true' below it (a note is in NOTES), else
 *  nothing. */
export function currentOf(path: string, href: string): 'page' | 'true' | undefined {
  const cur = normalPath(path);
  if (cur === href) return 'page';
  if (cur.startsWith(`${href}/`)) return 'true';
  return undefined;
}

const LANGS: Array<{ lang: Lang; key: Key; name: Key; html: string }> = [
  { lang: 'zh', key: 'lang.zh', name: 'lang.zhName', html: 'zh-Hans' },
  { lang: 'en', key: 'lang.en', name: 'lang.enName', html: 'en' },
];

/** 中 / EN: a radiogroup of two. Its visible state is CSS off html[data-lang]
 *  (correct from the first paint, before this island has hydrated); its
 *  aria-checked follows useLang() from hydration on. Arrow keys move and
 *  choose, as a radiogroup does; Tab lands on the language in use. */
export function LangSwitch({ tabbable = true }: { tabbable?: boolean }) {
  const lang = useLang();
  const t = useT();
  const groupRef = useRef<HTMLDivElement>(null);
  const choose = (next: Lang, focus = false) => {
    if (next !== lang) setLang(next);
    if (focus) groupRef.current?.querySelector<HTMLButtonElement>(`[data-lang-option="${next}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const at = LANGS.findIndex((option) => option.lang === lang);
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const next = event.key === 'Home' ? LANGS[0] : event.key === 'End' ? LANGS[LANGS.length - 1] : LANGS[(at + step + LANGS.length) % LANGS.length];
    choose(next.lang, true);
  };
  return (
    <div ref={groupRef} role="radiogroup" aria-label={t('lang.group')} className="site-lang" onKeyDown={onKeyDown}>
      <span className="site-lang__thumb" aria-hidden="true" />
      {LANGS.map((option) => (
        <button
          key={option.lang}
          type="button"
          role="radio"
          data-lang-option={option.lang}
          aria-checked={lang === option.lang}
          // Each option is named in its own language, so a reader who cannot
          // read the page's current one still finds his.
          aria-label={t(option.name)}
          lang={option.html}
          tabIndex={tabbable && lang === option.lang ? 0 : -1}
          className="site-lang__opt"
          onClick={() => choose(option.lang)}
        >
          {t(option.key)}
        </button>
      ))}
    </div>
  );
}

/** The right-hand set, shared by every page's nav and the homepage's own. */
export function NavSet({
  currentPath = '/',
  mapHref = '/travel',
  tabbable = true,
}: {
  currentPath?: string;
  /** The homepage's MAP opens /travel on the place in hand. */
  mapHref?: string;
  tabbable?: boolean;
}) {
  const onCurrent = (event: MouseEvent<HTMLAnchorElement>) => {
    // The page itself: nothing to go to (a same-page navigation would only
    // replay the page's arrival).
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) event.preventDefault();
  };
  return (
    <div className="site-navset">
      {NAV_LINKS.map((link) => {
        const current = currentOf(currentPath, link.href);
        return (
          <a
            key={link.href}
            href={link.href === '/travel' ? mapHref : link.href}
            data-astro-prefetch="hover"
            aria-current={current}
            tabIndex={tabbable ? undefined : -1}
            onClick={current === 'page' ? onCurrent : undefined}
            className="site-navset__link"
          >
            <T k={link.key} />
          </a>
        );
      })}
      <span className="site-navset__rule" aria-hidden="true" />
      <LangSwitch tabbable={tabbable} />
    </div>
  );
}

export default function Nav({ currentPath, scrim = false }: Props) {
  const t = useT();
  return (
    <nav
      aria-label={t('nav.aria')}
      data-site-nav
      className={`fixed top-0 left-0 w-full z-50 px-6 py-5 md:px-12 md:py-6 flex justify-between items-center gap-3 ${
        scrim
          ? 'bg-[linear-gradient(180deg,rgba(40,44,32,0.96)_0%,rgba(40,44,32,0.84)_72%,transparent_100%)] backdrop-blur-[2px]'
          : 'bg-transparent'
      }`}
      style={{
        paddingTop: 'max(1.25rem, env(safe-area-inset-top))',
        paddingLeft: 'max(clamp(1.5rem, 3.35vw, 3rem), env(safe-area-inset-left))',
        paddingRight: 'max(clamp(1.5rem, 3.35vw, 3rem), env(safe-area-inset-right))',
      }}
    >
      {/* Left: signature name — Home. */}
      <a
        href="/"
        data-astro-prefetch="hover"
        aria-label={t('nav.wordmarkAria')}
        lang="en"
        className="nav-wordmark inline-flex min-h-11 min-w-11 shrink-0 items-center whitespace-nowrap font-serif uppercase text-lg md:text-[21px] tracking-[0.1em] font-medium leading-none text-[#F4F4ED] mix-blend-difference hover:opacity-60 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
      >
        Ryan Xu
      </a>
      <NavSet currentPath={currentPath} />
    </nav>
  );
}
