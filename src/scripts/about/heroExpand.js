/* ============================================================
   Effect · Hero entrance load (动效 1)
   On page open: the framed portrait box loads in (fade + scale +
   slight rise) and a faint zoom settles on the photo; the identity
   lines beneath stagger up. Silky expo easing, one-shot on load.
   Reduced-motion: everything visible immediately, no transforms.
   ============================================================ */
export function initHeroExpand({ gsap, reduce }) {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const frame = hero.querySelector('[data-hero-frame]');
  const photo = frame ? frame.querySelector('img') : null;
  const idBlock = hero.querySelector('[data-hero-id]');
  const idLines = idBlock ? Array.from(idBlock.children) : [];

  if (reduce) {
    gsap.set([frame, photo, ...idLines].filter(Boolean), { clearProps: 'all', autoAlpha: 1 });
    return;
  }

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });

  if (frame) {
    // The box loads in.
    tl.from(frame, { autoAlpha: 0, scale: 0.9, yPercent: 8, duration: 1.2 }, 0.15);
  }
  if (photo) {
    // Faint settle-zoom on the photo inside the box.
    tl.from(photo, { scale: 1.16, duration: 1.6 }, 0.15);
  }
  if (idLines.length) {
    // Eyebrow → name → role → "Make it Best", rising in sequence.
    tl.from(idLines, { autoAlpha: 0, y: 22, duration: 0.85, stagger: 0.12 }, 0.55);
  }
}
