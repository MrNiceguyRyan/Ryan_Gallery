/**
 * SiteAtmosphere — the shared cool-dark backdrop mounted behind page content
 * on the homepage and about page (travel.astro inlines the same markup). It
 * paints two faint sky-blue corner glows plus a topographic contour field — a
 * stronger version of the footer's "ripple". Static apart from one very slow,
 * imperceptible drift. All styling (glow reach, contour strength) lives in
 * global.css under `.site-atmos*`, so this is markup only.
 */
export default function SiteAtmosphere() {
  return (
    <div className="site-atmos" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="none">
        <path d="M-40 90 Q380 30 780 100 T1480 86" opacity="0.10" />
        <path d="M-40 170 Q360 110 760 182 T1480 168" opacity="0.13" />
        <path d="M-40 250 Q400 188 800 262 T1480 250" opacity="0.09" />
        <path d="M-40 330 Q360 270 740 344 T1480 330" opacity="0.12" />
        <path d="M-40 410 Q420 348 820 424 T1480 410" opacity="0.09" />
        <path d="M-40 490 Q360 430 760 504 T1480 490" opacity="0.13" />
        <path d="M-40 570 Q400 508 800 584 T1480 570" opacity="0.09" />
        <path d="M-40 650 Q360 590 740 664 T1480 650" opacity="0.12" />
        <path d="M-40 730 Q420 668 820 744 T1480 730" opacity="0.09" />
        <path d="M-40 810 Q360 750 760 824 T1480 810" opacity="0.11" />
        <path d="M-120 900 Q720 560 1560 900" opacity="0.08" />
        <path d="M-120 980 Q720 640 1560 980" opacity="0.06" />
      </svg>
    </div>
  );
}
