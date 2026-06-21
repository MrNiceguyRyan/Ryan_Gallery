/* ============================================================
   Effect · Image clip-path reveal (动效 4)
   Each [data-img-reveal] photo opens from a centre slit (clip-path
   inset band) while a larger scale settles back to 1 — a breathing
   reveal, scrubbed as the figure crosses the viewport.
   Reduced-motion: shown fully, no transform.
   ============================================================ */
export function initImageReveal({ gsap, reduce }) {
  gsap.utils.toArray('[data-img-reveal]').forEach((fig) => {
    const img = fig.querySelector('img');
    if (!img) return;

    if (reduce) {
      gsap.set(img, { clipPath: 'inset(0%)', scale: 1 });
      return;
    }

    gsap.fromTo(
      img,
      { clipPath: 'inset(42% 0% 42% 0%)', scale: 1.35 },
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        scale: 1,
        ease: 'none',
        scrollTrigger: { trigger: fig, start: 'top 85%', end: 'top 28%', scrub: true },
      },
    );
  });
}
