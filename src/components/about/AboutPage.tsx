import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ExposureTotals } from '../../lib/exposureRecord';
import { startLenis } from '../../lib/smoothScroll';

// ── /about: the darkroom biography ──
// The monograph's end matter: the contributor cover lifts off a page that is
// already set; the photographer's page (a silver-print portrait and the
// name); the signature, drawn by the scroll over one sentence; a
// correspondence ticket and the colophon.
//
// Everything here renders at its final values, on the server and on the
// client alike: the page paints finished without JavaScript. How it arrives
// is CSS (global.css, "/about: darkroom biography"), keyed off attributes
// about.astro's inline scripts write on <html> before the first paint —
// outside React, so nothing here can mismatch hydration. Nothing reads
// reduced motion: under it CSS changes values, never structure. The one
// client state is whether the cover has gone.

// The contributor cover plays in full once per session. about.astro writes
// the key before the first paint; Layout.astro reads it (via the cover's
// data-entry-cover) to keep the plane off a view-transition arrival.
export const ABOUT_SESSION_KEY = 'ryan-gallery:about-entry-seen';

// One continuous mask travels through the complete autograph. The visible
// mark still comes from the rounded source asset, so the connector curves can
// bridge blank pixels without changing the finished silhouette. pathLength=1:
// the pen is written in fractions of the path (about.astro, by the scroll).
const SIGNATURE_REVEAL_PATH = 'M21.7,53.28 C1.97,58.33 5.74,51.92 11.58,47.08 C17.75,41.97 26.22,38.61 34.44,35.47 C49.89,29.57 64.44,24.43 79.74,20.04 C108.54,11.78 140.03,6.17 170.64,4.31 C177.88,3.87 185.08,3.64 193.66,4.29 C202.79,4.98 213.49,6.67 215.5,10.1 C217.76,13.93 209.16,19.94 200.95,23.22 C193.36,26.25 186.09,26.94 177.5,28.97 C168.64,31.06 158.38,34.56 161.35,36.97 C162.74,38.1 167.03,39 169.45,40.22 C172.16,41.59 172.54,43.37 171.24,45.22 C165.95,52.73 132.97,61.35 131.61,71.34 C110,74 77,72 55.28,70.5 C73.66,48.15 98.7,50.3 122.8,44.62 C128.63,43.25 134.39,41.42 140.22,40.17 C145.87,38.95 151.57,38.28 157.28,38.48 C169.43,38.89 181.58,43.23 191.11,35.35 C171,31.5 143,30.5 122.61,34.13 C99.81,47.75 111.76,48.45 122.09,46.09 C132.14,43.78 140.66,38.58 151.81,37.29 C157.28,36.65 163.39,36.96 167.36,38.61 C169.29,39.42 170.72,40.54 171.54,42.05 C172.51,43.86 172.62,46.24 173.38,47.92 C175.97,53.65 186.15,51.47 196.23,49.32 C235.5,40.91 273.31,32.73 315.57,38.08';

const PARTICULARS: Array<[string, string]> = [
  ['Focus', 'Light. Geometry. Stillness.'],
  ['Method', 'One frame at a time. Real shutter, real exposure.'],
  ['Log', 'Personal archive, selected frames only.'],
];

/** The portrait as about.astro printed it: the silver webps at their
 *  widths, or (a portrait that is not a Sanity asset) the file itself with
 *  the live silver filter's tables. */
export interface AboutPortrait {
  src: string;
  srcSet?: string;
  sizes?: string;
  width: number;
  height: number;
  silver?: [number[], number[], number[]];
}

interface Props {
  name: string;
  bio?: string | null;
  email: string;
  instagram: string;
  portrait: AboutPortrait;
  totals: ExposureTotals;
  /** The build's date and year in New York, formatted at build time. */
  updatedOn: string;
  year: string;
}

const vars = (values: Record<string, string | number>) => values as CSSProperties;

/**
 * The contributor cover. Built and lifted by CSS from the first paint; this
 * only takes the plane out of the page once it has gone (or when CSS has
 * hidden it: a repeat visit, a view-transition arrival, reduced motion).
 */
function ContributorCover({ name, onGone }: { name: string; onGone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

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

  // "It can be left" (c55e206): the plane goes on a quick wipe off the
  // finished page. Not the repeat visit's entrance: switched mid-cover, that
  // restarted some of the page's moves and not others, and the lime line
  // stood under a name that had not risen yet.
  const skip = () => {
    ref.current?.setAttribute('data-skipped', '');
    document.documentElement.setAttribute('data-about-entry', 'skip');
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };

  return (
    <div ref={ref} className="about-cover" data-entry-cover={ABOUT_SESSION_KEY}>
      {/* The decoration is aria-hidden, so the plane says what it is. */}
      <span className="sr-only" role="status">
        Opening the profile
      </span>
      <button
        type="button"
        onClick={skip}
        className="fixed left-4 top-4 z-10 inline-flex min-h-11 -translate-y-[160%] items-center rounded-full bg-[#F4F4ED] px-5 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-[#171b15] transition-transform duration-200 focus:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
      >
        Skip entrance
      </button>
      {/* Newspaper column rules. */}
      <div aria-hidden="true" className="about-cover__rules">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="about-cover__rule" style={vars({ '--i': i })} />
        ))}
      </div>
      <div aria-hidden="true" className="about-cover__masthead">
        <div className="about-cover__masthead-row">
          <span className="about-label">The Journal Gallery</span>
          <span className="about-label">The Profile</span>
        </div>
        <div className="about-cover__masthead-rule" />
      </div>
      <div aria-hidden="true" className="about-cover__center">
        <span className="about-label about-cover__kicker">Photographer</span>
        <div className="about-cover__namebox">
          <span className="about-cover__name">{name}</span>
        </div>
        <span className="about-label about-cover__city">New York, NY</span>
      </div>
      {/* Folio: the camera line. */}
      <div aria-hidden="true" className="about-cover__folio">
        <span className="about-label about-cover__folio-lead">Contributor</span>
        <span className="about-label about-cover__folio-cams">Nikon Zf · Fujifilm X-T50</span>
      </div>
    </div>
  );
}

/** The profile: running head, the portrait in its droplet, the name, the
 *  lede, the bio and the particulars. */
function Profile({ name, bio, portrait }: Pick<Props, 'name' | 'bio' | 'portrait'>) {
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
    <section className="about-hero about-wrap" aria-labelledby="about-name">
      <header className="about-runhead">
        <span className="about-label">The Profile</span>
        <span className="about-label">
          <span className="about-runhead__long">New York · Since 2023</span>
          <span className="about-runhead__short">NY · 2023</span>
        </span>
        <span className="about-runhead__rule" aria-hidden="true" />
      </header>

      <div className="about-hero__grid">
        <figure className="about-portrait">
          {/* The droplet (a3e2ac3): the photo masked in an organic water-drop
              shape that slowly morphs, and an offset bone outline drifting on
              a desynced phase behind it. The print inside is the globe's
              silver, graded once at build time (portrait-[w].webp). */}
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
                style={portrait.silver ? { filter: 'url(#about-silver)' } : undefined}
              />
            </div>
            {portrait.silver && (
              <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
                <filter id="about-silver" colorInterpolationFilters="sRGB">
                  <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0" />
                  <feComponentTransfer>
                    <feFuncR type="table" tableValues={portrait.silver[0].join(' ')} />
                    <feFuncG type="table" tableValues={portrait.silver[1].join(' ')} />
                    <feFuncB type="table" tableValues={portrait.silver[2].join(' ')} />
                  </feComponentTransfer>
                </filter>
              </svg>
            )}
          </div>
          <figcaption className="about-caption about-label">
            <span>Photographer</span>
            <span>New York, NY</span>
          </figcaption>
        </figure>

        <div className="about-hero__text">
          <h1 className="about-name" id="about-name">
            <span className="about-mask">
              <span className="about-name__line">{name}</span>
            </span>
            <span className="about-underline" aria-hidden="true" />
          </h1>
          <p className="about-lede">Cities and landscapes, one frame at a time.</p>
          <div className="about-hero__cols">
            {/* Override the fallback by filling `siteSettings.bio` in Sanity. */}
            <div className="about-bio">
              {bio ? (
                <p style={{ whiteSpace: 'pre-line' }}>{bio}</p>
              ) : (
                <>
                  <p>
                    A photographic record of moving through cities and landscapes, from the high-contrast geometry of
                    Manhattan to the geologic time of the American Southwest. No commissioned work, no client briefs.
                    Frames selected on a slow timeline, organized by location, dated.
                  </p>
                  <p>
                    Off the camera: engineering and AI research. The discipline of careful observation transfers
                    between the two; both reward patience over output volume. This site is one node in a personal
                    archive, not a portfolio for hire.
                  </p>
                </>
              )}
            </div>
            <dl className="about-particulars">
              {PARTICULARS.map(([term, value], i) => (
                <div key={term} style={vars({ '--i': i })}>
                  <dt className="about-label">{term}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The sign-off: the autograph over the one sentence. It is drawn as the page
 *  is scrolled down past it and un-drawn as it is scrolled back up
 *  (about.astro moves the pen); fully drawn by default. */
function SignOff() {
  return (
    <section className="about-signoff about-wrap" data-about-reveal="signoff">
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
            {/* Bone ink: the asset is lime, and the view's one lime is
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
      {/* Set in the site's face (it was Space Grotesk 700 at display size):
          Fraunces 400, the verb in italic, only the light lit. */}
      <p className="about-sentence">
        <span className="about-mask">
          <span className="about-sentence__line" style={vars({ '--i': 0 })}>
            Always <em>chasing</em>
          </span>
        </span>
        <span className="about-mask">
          <span className="about-sentence__line" style={vars({ '--i': 1 })}>
            the <em className="about-lime">light.</em>
          </span>
        </span>
      </p>
    </section>
  );
}

/** End matter: the correspondence ticket (the homepage ticket's anatomy,
 *  used once) and the colophon, then the foot. */
function EndMatter({ name, email, instagram, totals, updatedOn, year }: Pick<Props, 'name' | 'email' | 'instagram' | 'totals' | 'updatedOn' | 'year'>) {
  const at = email.indexOf('@');
  const handle = '@' + (instagram.replace(/\/+$/, '').split('/').pop() || 'instagram');
  const colophon: Array<[string, string]> = [
    ['Type', 'Fraunces, Space Grotesk'],
    // The frames report their own bodies, so the colophon cannot claim a
    // camera the archive does not contain.
    ['Cameras', totals.bodies.length ? totals.bodies.join(', ') : 'Fujifilm X-T50, Nikon Zf'],
    ['Built with', 'Astro, React, Sanity and Mapbox GL, on Cloudflare Workers'],
  ];
  if (updatedOn) colophon.push(['Updated', updatedOn]);

  return (
    <section className="about-end about-wrap" data-about-reveal="end">
      <div className="about-end__grid">
        <div className="about-end__contact about-end__block" style={vars({ '--i': 0 })}>
          <span className="about-label">Get in touch</span>
          <div className="about-ticket">
            <div className="about-ticket__face ticket-seam-right">
              <span className="about-label">Email</span>
              <span className="about-ticket__write">
                <a className="about-ticket__mail" href={`mailto:${email}`}>
                  {at > 0 ? (
                    <>
                      {email.slice(0, at)}
                      <wbr />
                      {email.slice(at)}
                    </>
                  ) : (
                    email
                  )}
                  {' '}
                  <span className="about-arrow" aria-hidden="true">↗</span>
                </a>
              </span>
              <div className="about-ticket__rule" />
              <div className="about-ticket__line">
                <span className="about-label">Instagram</span>
                <a className="about-data" href={instagram} target="_blank" rel="noopener noreferrer">
                  {handle} <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
            {/* The stub: the archive's count, and where it is kept from. */}
            <div className="about-ticket__stub ticket-seam-left">
              <span className="about-stub__no">{String(totals.chapters).padStart(2, '0')}</span>
              <span className="about-label about-stub__of">Chapters</span>
              <span className="about-stub__rule" />
              <dl className="about-stub__rows">
                <div>
                  <dt>Frames</dt>
                  <dd>{totals.frames}</dd>
                </div>
                <div>
                  <dt>Since</dt>
                  <dd>2023</dd>
                </div>
                <div>
                  <dt>Base</dt>
                  <dd>New York</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
        <div className="about-end__colophon about-end__block" style={vars({ '--i': 1 })}>
          <span className="about-label">Colophon</span>
          <dl className="about-colophon">
            {colophon.map(([term, value]) => (
              <div key={term}>
                <dt className="about-label">{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <footer className="about-foot about-label about-end__block" style={vars({ '--i': 2 })}>
        <span>
          © {year} {name}. All rights reserved.
        </span>
        <a href="/">ryanxugallery.com</a>
      </footer>
    </section>
  );
}

export default function AboutPage({ name, bio, email, instagram, portrait, totals, updatedOn, year }: Props) {
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
        <Profile name={name} bio={bio} portrait={portrait} />
        {/* The middle, kept open for a written section (an essay): its own
            <section className="about-wrap"> here, between the profile and
            the sign-off, set in the bio's reading type. Below the fold it
            takes a data-about-reveal name and an entrance in global.css
            ("Below the fold"), as the end matter does. The signature's
            scrub derives its range from the layout, so it needs nothing. */}
        <SignOff />
        <EndMatter name={name} email={email} instagram={instagram} totals={totals} updatedOn={updatedOn} year={year} />
      </div>
    </main>
  );
}
