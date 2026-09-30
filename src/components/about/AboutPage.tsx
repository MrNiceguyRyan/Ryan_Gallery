import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ExposureTotals } from '../../lib/exposureRecord';
import { startLenis } from '../../lib/smoothScroll';
import { Bi, T, usePick, useT } from '../../i18n/react';
import { both, tr, type Key } from '../../i18n/dict';
import type { Lang } from '../../i18n/runtime';
import type { SiteText } from '../../i18n/content';
import ContactTicket from './ContactTicket';

// ── /about: the profile ──
// The page the owner kept coming back to (restored 2026-09-27 over the
// "darkroom biography" of the same day): the contributor cover lifting off
// the profile — the droplet portrait and its stacked particulars beside the
// name, its lime line, the lede, the bio and FOCUS / METHOD / LOG — then,
// once a note is published, a quiet line from the notes where the log used
// to stand, and the closing card: the autograph, written by the scroll, over
// "Always chasing the light.", the correspondence ticket (whose stub can be
// torn off to copy the address) and the colophon.
//
// Everything renders at its final values, on the server and on the client
// alike: the page paints finished without JavaScript. How it arrives is CSS
// (global.css, "/about: the profile"), keyed off attributes about.astro's
// inline scripts write on <html> before the first paint — outside React, so
// nothing here can mismatch hydration. Nothing reads reduced motion to
// decide what to render: under it CSS changes values, never structure.
//
// 中 / EN: every word the reader sees is printed in both languages and CSS
// shows one (src/i18n/runtime.ts): the labels from the dictionary (<T>),
// his prose — the lede, the bio, FOCUS / METHOD / LOG — beside its Chinese
// (<Bi>, siteText in about.astro). Only what a screen reader alone reads is
// one language (useT).

// The contributor cover plays in full once per session. about.astro writes
// the key before the first paint; Layout.astro reads it (via the cover's
// data-entry-cover) to keep the plane off a view-transition arrival.
export const ABOUT_SESSION_KEY = 'ryan-gallery:about-entry-seen';

// One continuous mask travels through the complete autograph. The visible
// mark still comes from the rounded source asset, so the connector curves can
// bridge blank pixels without changing the finished silhouette. pathLength=1:
// the pen is written in fractions of the path (about.astro, by the scroll).
const SIGNATURE_REVEAL_PATH = 'M21.7,53.28 C1.97,58.33 5.74,51.92 11.58,47.08 C17.75,41.97 26.22,38.61 34.44,35.47 C49.89,29.57 64.44,24.43 79.74,20.04 C108.54,11.78 140.03,6.17 170.64,4.31 C177.88,3.87 185.08,3.64 193.66,4.29 C202.79,4.98 213.49,6.67 215.5,10.1 C217.76,13.93 209.16,19.94 200.95,23.22 C193.36,26.25 186.09,26.94 177.5,28.97 C168.64,31.06 158.38,34.56 161.35,36.97 C162.74,38.1 167.03,39 169.45,40.22 C172.16,41.59 172.54,43.37 171.24,45.22 C165.95,52.73 132.97,61.35 131.61,71.34 C110,74 77,72 55.28,70.5 C73.66,48.15 98.7,50.3 122.8,44.62 C128.63,43.25 134.39,41.42 140.22,40.17 C145.87,38.95 151.57,38.28 157.28,38.48 C169.43,38.89 181.58,43.23 191.11,35.35 C171,31.5 143,30.5 122.61,34.13 C99.81,47.75 111.76,48.45 122.09,46.09 C132.14,43.78 140.66,38.58 151.81,37.29 C157.28,36.65 163.39,36.96 167.36,38.61 C169.29,39.42 170.72,40.54 171.54,42.05 C172.51,43.86 172.62,46.24 173.38,47.92 C175.97,53.65 186.15,51.47 196.23,49.32 C235.5,40.91 273.31,32.73 315.57,38.08';

/** The portrait as about.astro sized it: the 4:5 crop at its widths, or the
 *  file itself when it is not a Sanity asset. */
export interface AboutPortrait {
  src: string;
  srcSet?: string;
  sizes?: string;
  width: number;
  height: number;
}

/** The note the middle quotes (about.astro: the featured note, else the
 *  newest), formatted at build time. */
export interface AboutNote {
  title: string;
  /** The note's Chinese twins, where he wrote them (src/lib/notes.ts). */
  titleZh: string | null;
  dek: string | null;
  dekZh: string | null;
  href: string;
  /** "01" — the column's own number. */
  number: string;
  /** "Sep 27, 2026" · "2026年9月27日", in New York. */
  date: string;
  dateZh: string;
  titleLang: string | null;
  dekLang: string | null;
  /** The page links the Chinese serif (Noto Serif SC) for it. */
  cjkSerif: boolean;
}

interface Props {
  name: string;
  /** His prose in both languages (about.astro: siteText). The bio is
   *  paragraphs in each. */
  bio: SiteText['bio'];
  lede: SiteText['lede'];
  particulars: SiteText['particulars'];
  email: string;
  instagram: string;
  portrait: AboutPortrait;
  totals: ExposureTotals;
  /** The build's date in New York in both languages, and its year (a
   *  figure in both), formatted at build time. */
  updatedOn: { en: string; zh?: string };
  year: string;
  /** The notes' teaser; null (nothing printed) until a note is published. */
  note?: AboutNote | null;
}

const vars = (values: Record<string, string | number>) => values as CSSProperties;

/** Paragraphs in both languages, paired in order: each <p> holds the
 *  English and the Chinese of one paragraph and CSS shows one. When the two
 *  have a different count, the extra paragraphs of one language are in <p>s
 *  of their own, empty (and marginless) in the other. */
function Paragraphs({ en, zh }: { en: string[]; zh?: string[] }) {
  if (!zh?.length) return <>{en.map((text, i) => <p key={i}>{text}</p>)}</>;
  return (
    <>
      {Array.from({ length: Math.max(en.length, zh.length) }, (_, i) => (
        <p key={i}>
          {en[i] ? <span data-l="en">{en[i]}</span> : null}
          {zh[i] ? (
            <span data-l="zh" lang="zh-Hans">
              {zh[i]}
            </span>
          ) : null}
        </p>
      ))}
    </>
  );
}

/** A dictionary line with marked words: its {placeholders} become the
 *  given elements ("Always {chasing}" → Always <em>chasing</em>). */
function rich(template: string, parts: Record<string, ReactNode>): ReactNode {
  return template.split(/\{(\w+)\}/).map((piece, i) =>
    i % 2 === 1 ? <Fragment key={i}>{parts[piece] ?? null}</Fragment> : piece ? <Fragment key={i}>{piece}</Fragment> : null,
  );
}

/** "Always chasing / the light." in one language: the verb and the light
 *  marked, the light the card's one lime. */
function Signoff({ lang }: { lang: Lang }) {
  const parts = {
    chasing: <em>{tr(lang, 'about.signoff.chasing')}</em>,
    light: <em className="about-lime">{tr(lang, 'about.signoff.light')}</em>,
  };
  return (
    <>
      {rich(tr(lang, 'about.signoff.line1'), parts)}
      <br />
      {rich(tr(lang, 'about.signoff.line2'), parts)}
    </>
  );
}

/** Space Grotesk has no arrows: drawn, in the text's own ink. */
function ArrowRight() {
  return (
    <svg className="about-arrow-r" viewBox="0 0 16 10" width="16" height="10" aria-hidden="true" focusable="false">
      <path d="M1 5h13.5M10.5 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  );
}

/**
 * The contributor cover. Built and lifted by CSS from the first paint; this
 * only takes the plane out of the page once it has gone (or when CSS has
 * hidden it: a repeat visit, a view-transition arrival, reduced motion).
 */
function ContributorCover({ name, onGone }: { name: string; onGone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    const cover = ref.current;
    if (!cover) return;
    let live = true;
    const settle = () => {
      if (!live) return;
      if (getComputedStyle(cover).display === 'none') {
        onGone();
        return;
      }
      const plane = cover
        .getAnimations()
        .find((animation) => String((animation as CSSAnimation).animationName ?? '').startsWith('about-cover-'));
      if (!plane) {
        onGone();
        return;
      }
      // A skip replaces the lift with the wipe: the lift is cancelled and the
      // wipe is what is waited for.
      plane.finished.then(() => live && onGone(), settle);
    };
    settle();
    return () => {
      live = false;
    };
  }, [onGone]);

  // "It can be left": the plane goes on a quick wipe off the finished page.
  const skip = () => {
    ref.current?.setAttribute('data-skipped', '');
    document.documentElement.setAttribute('data-about-entry', 'skip');
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };

  return (
    <div ref={ref} className="about-cover" data-entry-cover={ABOUT_SESSION_KEY}>
      {/* The decoration is aria-hidden, so the plane says what it is. */}
      <span className="sr-only" role="status">
        {t('about.cover.sr')}
      </span>
      <button
        type="button"
        onClick={skip}
        className="fixed left-4 top-4 z-10 inline-flex min-h-11 -translate-y-[160%] items-center rounded-full bg-[#F4F4ED] px-5 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-[#171b15] transition-transform duration-200 focus:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
      >
        <T k="about.cover.skip" />
      </button>
      {/* Newspaper column rules. */}
      <div aria-hidden="true" className="about-cover__rules">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="about-cover__rule" style={vars({ '--i': i })} />
        ))}
      </div>
      <div aria-hidden="true" className="about-cover__masthead">
        <div className="about-cover__masthead-row">
          <span className="about-label">
            <T k="about.cover.masthead" />
          </span>
          <span className="about-label">
            <T k="about.cover.section" />
          </span>
        </div>
        <div className="about-cover__masthead-rule" />
      </div>
      <div aria-hidden="true" className="about-cover__center">
        <span className="about-label about-cover__kicker">
          <T k="about.cover.kicker" />
        </span>
        <div className="about-cover__namebox">
          <span className="about-cover__name">{name}</span>
        </div>
        <span className="about-label about-cover__city">
          <T k="about.cover.city" />
        </span>
      </div>
      {/* Folio: the camera line. */}
      <div aria-hidden="true" className="about-cover__folio">
        <span className="about-label about-cover__folio-lead">
          <T k="about.cover.folio" />
        </span>
        <span className="about-label about-cover__folio-cams">Nikon Zf · Fujifilm X-T50</span>
      </div>
    </div>
  );
}

/**
 * The profile: the running head, the droplet portrait over its stacked
 * particulars on the left, the name (its lime line the first screen's one
 * lime), the lede, the bio and FOCUS / METHOD / LOG on the right. Each
 * `.about-set` is one line of the page being set, in reading order (`--o`),
 * when the cover lifts or on a repeat visit (global.css).
 */
function Profile({
  name,
  bio,
  lede,
  particulars,
  portrait,
  bodies,
}: Pick<Props, 'name' | 'bio' | 'lede' | 'particulars' | 'portrait'> & { bodies: string[] }) {
  const dropRef = useRef<HTMLDivElement>(null);

  // The droplet morphs forever, twice (print and outline); off screen it
  // holds still. Written straight onto the node: nothing re-renders.
  useEffect(() => {
    const drop = dropRef.current;
    if (!drop || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) drop.removeAttribute('data-idle');
        else drop.setAttribute('data-idle', '');
      },
      { rootMargin: '120px 0px' },
    );
    observer.observe(drop);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="about-hero safe-inline-page" aria-labelledby="about-name">
      <header className="about-runhead about-set" style={vars({ '--o': 0 })}>
        <span className="about-runhead__lead">
          <T k="about.runhead.lead" />
        </span>
        <span className="about-runhead__short">
          <T k="about.runhead.short" />
        </span>
        <span className="about-runhead__long">
          <T k="about.runhead.long" />
        </span>
      </header>

      <div className="about-hero__grid">
        <div className="about-hero__side">
          {/* The droplet: the photograph masked in a water-drop shape that
              slowly morphs, and an offset bone outline drifting on a desynced
              phase behind it — the border is water, not a box. Under a
              resting pointer the print pushes in, slowly, inside its shape. */}
          <div ref={dropRef} className="about-drop">
            <span className="about-drop__outline" aria-hidden="true" />
            <div className="about-drop__print">
              <img
                className="about-drop__img"
                src={portrait.src}
                srcSet={portrait.srcSet}
                sizes={portrait.sizes}
                alt={name}
                width={portrait.width}
                height={portrait.height}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                draggable={false}
              />
            </div>
          </div>
          {/* One fact per line (no middle-dot pileup). */}
          <div className="about-meta about-set" style={vars({ '--o': 3 })}>
            <span className="about-meta__lead">
              <T k="about.meta.role" />
            </span>
            <span>
              <T k="about.meta.city" />
            </span>
            <span>{bodies.length ? bodies.join(' · ') : 'Fujifilm X-T50 · Nikon Zf'}</span>
            <span className="about-meta__since">
              <T k="about.meta.since" />
            </span>
          </div>
        </div>

        <div className="about-hero__text">
          <div className="about-set" style={vars({ '--o': 1 })}>
            <h1 className="about-name" id="about-name">
              <span className="about-name__ink">
                {name}
                <span className="about-underline" aria-hidden="true" />
              </span>
            </h1>
          </div>
          <p className="about-lede about-set" style={vars({ '--o': 2 })}>
            <Bi en={lede.en} zh={lede.zh} />
          </p>
          {/* His words from siteSettings (bio / bioZh, particulars), else the
              page's own and our Chinese drafts (src/i18n/content.ts
              siteText). A bio is paragraphs, split on blank lines, in both
              languages. */}
          <div className="about-bio about-set" style={vars({ '--o': 3 })}>
            <Paragraphs en={bio.en} zh={bio.zh} />
            <dl className="about-particulars">
              {particulars.map(({ term, termZh, value, valueZh }) => (
                <div key={term}>
                  <dt>
                    <Bi en={term} zh={termZh} />
                  </dt>
                  <dd>
                    <Bi en={value} zh={valueZh} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Where the log stood: one line from the notes, once one is published — the
 * log's own running head (THE NOTES … its number and date), then the note's
 * dek in the lede's italic, on the name's column, linked to the note, and
 * the way to the rest. Bone only: it adds no lime.
 */
function NotesTeaser({ note }: { note: AboutNote }) {
  const t = useT();
  const pick = usePick();
  const statement = note.dek ?? note.title;
  const statementZh = note.dek ? note.dekZh : note.titleZh;
  // His words keep their own lang, unless a Chinese twin is beside them:
  // then the line follows the page's (html[lang]), as the twin it shows
  // does, and global.css sets it as Chinese exactly when the twin shows.
  const lang = statementZh ? undefined : (note.dek ? note.dekLang : note.titleLang) ?? 'en';
  return (
    <section
      className="about-notes safe-inline-page"
      data-about-reveal="notes"
      data-cjk-serif={note.cjkSerif ? '' : undefined}
      aria-labelledby="about-notes-head"
    >
      <div className="about-notes__head about-notes__block" style={vars({ '--i': 0 })}>
        <h2 className="about-notes__title" id="about-notes-head">
          <T k="about.notes.title" />
        </h2>
        <span className="about-notes__stamp">
          <Bi
            en={tr('en', 'about.notes.stamp', { nn: note.number, date: note.date })}
            zh={tr('zh', 'about.notes.stamp', { nn: note.number, date: note.dateZh })}
          />
        </span>
      </div>
      <div className="about-notes__grid about-notes__block" style={vars({ '--i': 1 })}>
        <div className="about-notes__body">
          <p className="about-notes__dek" lang={lang}>
            <a
              href={note.href}
              aria-label={
                note.dek
                  ? t('about.notes.linkAria', { title: pick(note.title, note.titleZh), dek: pick(note.dek, note.dekZh) })
                  : undefined
              }
            >
              <Bi en={statement} zh={statementZh} />
            </a>
          </p>
          <a className="about-notes__more" href="/notes">
            <T k="about.notes.more" />
            <ArrowRight />
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * The closing card: the autograph over the one sentence (the card's one
 * lime is "light."), the correspondence ticket in the middle — the contact,
 * where the pill was — and the colophon under a hairline, then the foot.
 */
function Closing({ name, email, instagram, totals, updatedOn, year }: Pick<Props, 'name' | 'email' | 'instagram' | 'totals' | 'updatedOn' | 'year'>) {
  // Facts only. The frames report their own bodies, so the colophon cannot
  // claim a camera the archive does not contain; the chapter and frame
  // counts are on the ticket's stub. Each fact in both languages (the
  // camera names are the makers', listed with the Chinese 、 in Chinese).
  const bodies = totals.bodies.length ? totals.bodies : ['Fujifilm X-T50', 'Nikon Zf'];
  const colophon: Array<{ term: Key; value: { en: string; zh?: string } }> = [
    { term: 'about.colophon.type', value: both('about.colophon.typeValue') },
    { term: 'about.colophon.cameras', value: { en: bodies.join(', '), zh: bodies.join('、') } },
    { term: 'about.colophon.builtWith', value: both('about.colophon.builtWithValue') },
  ];
  if (updatedOn.en) colophon.push({ term: 'about.colophon.updated', value: updatedOn });

  return (
    <section className="about-close safe-inline-page">
      <div className="about-card">
        <div className="about-signoff">
          {/* Drawn as the page is scrolled down past it and un-drawn as it is
              scrolled back up (about.astro moves the pen); whole by default.
              The pen is its arrival, so it is never faded in with the
              sentence: its first stroke shows from the first pixel of
              scroll. */}
          <div className="about-signature" aria-hidden="true">
            <svg viewBox="0 0 320 84" focusable="false">
              <defs>
                <mask
                  id="about-sig-mask"
                  x="0"
                  y="0"
                  width="320"
                  height="84"
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                  style={{ maskType: 'alpha' }}
                >
                  <path
                    className="about-pen"
                    d={SIGNATURE_REVEAL_PATH}
                    pathLength={1}
                    fill="none"
                    stroke="white"
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </mask>
                {/* Bone ink: the asset is lime, and the card's one lime is
                    "light." below. The matrix keeps the scan's alpha. */}
                <filter id="about-sig-ink" colorInterpolationFilters="sRGB">
                  <feColorMatrix type="matrix" values="0 0 0 0 0.957  0 0 0 0 0.957  0 0 0 0 0.929  0 0 0 1 0" />
                </filter>
              </defs>
              <image
                href="/assets/signature/abstract-autograph-rounded.png"
                x="0"
                y="0"
                width="320"
                height="84"
                preserveAspectRatio="none"
                filter="url(#about-sig-ink)"
                mask="url(#about-sig-mask)"
              />
            </svg>
          </div>
          {/* Space Grotesk 700 with the verb and the light in Fraunces italic
              500; only the light is lit. */}
          <h2 className="about-statement" data-about-reveal="signoff">
            <span data-l="en">
              <Signoff lang="en" />
            </span>
            <span data-l="zh" lang="zh-Hans">
              <Signoff lang="zh" />
            </span>
          </h2>
        </div>

        <ContactTicket email={email} instagram={instagram} chapters={totals.chapters} frames={totals.frames} />

        {/* The colophon — what the archive is set in, what made it, what it
            runs on, when it last changed. Facts only, two to a line from
            768px; each fact is timed by the line it lands on (`--r`, `--rp`). */}
        <div className="about-colophon" data-about-reveal="colophon">
          <span className="about-colophon__rule" aria-hidden="true" />
          <dl className="about-colophon__list">
            {colophon.map(({ term, value }, i) => (
              <Fragment key={term}>
                <dt style={vars({ '--r': i, '--rp': Math.floor(i / 2) })}>
                  <T k={term} />
                </dt>
                <dd style={vars({ '--r': i, '--rp': Math.floor(i / 2) })}>
                  <Bi en={value.en} zh={value.zh} />
                </dd>
              </Fragment>
            ))}
          </dl>
          <footer className="about-foot" style={vars({ '--r': colophon.length - 1, '--rp': Math.floor((colophon.length - 1) / 2) })}>
            <span>
              <T k="about.copyright" vars={{ year, name }} />
            </span>
            <a href="/">ryanxugallery.com</a>
          </footer>
        </div>
      </div>
    </section>
  );
}

export default function AboutPage({
  name,
  bio,
  lede,
  particulars,
  email,
  instagram,
  portrait,
  totals,
  updatedOn,
  year,
  note = null,
}: Props) {
  const [coverGone, setCoverGone] = useState(false);
  const onCoverGone = useCallback(() => setCoverGone(true), []);

  // Same weighty inertial smooth-scroll as the homepage, so browsing About
  // feels identical. Torn down on unmount (route change); no-op under reduced
  // motion and on touch.
  useEffect(() => {
    const { destroy } = startLenis();
    return destroy;
  }, []);

  return (
    <main id="main-content" tabIndex={-1} className="about">
      {!coverGone && <ContributorCover name={name} onGone={onCoverGone} />}
      <div className="about-page">
        <Profile name={name} bio={bio} lede={lede} particulars={particulars} portrait={portrait} bodies={totals.bodies} />
        {/* The middle, where the log stood: the notes' line once a note is
            published, nothing (not an empty box) before. It also keeps the
            name's lime line and "light." a screen apart (global.css). */}
        <div className="about-middle">{note && <NotesTeaser note={note} />}</div>
        <Closing name={name} email={email} instagram={instagram} totals={totals} updatedOn={updatedOn} year={year} />
      </div>
    </main>
  );
}
