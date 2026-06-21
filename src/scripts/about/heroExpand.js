/* ============================================================
   Effect · Hero entrance load (动效 1)
   On page open the portrait settles in behind, the black box loads
   in (fade + scale + slight rise), and the box's lines stagger up.
   Silky expo easing, one-shot on load (not scroll-driven).
   Reduced-motion: everything visible immediately, no transforms.
   ============================================================ */
export function initHeroExpand({ gsap, reduce }) {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const bg = hero.querySelector('.hero__bg img');
  const card = hero.querySelector('[data-hero-card]');
  const kids = card ? Array.from(card.children) : [];

  if (reduce) {
    // No motion — guarantee the box and portrait are simply present.
    gsap.set([bg, card, ...kids].filter(Boolean), { clearProps: 'all', autoAlpha: 1 });
    return;
  }

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });

  if (bg) {
    tl.from(bg, { scale: 1.18, autoAlpha: 0, duration: 1.7 }, 0);
  }
  if (card) {
    // The box loads in.
    tl.from(card, { autoAlpha: 0, scale: 0.9, yPercent: 8, duration: 1.2 }, 0.25);
  }
  if (kids.length) {
    // Box contents rise in sequence (eyebrow → "Make it Best" → name).
    tl.from(kids, { autoAlpha: 0, y: 20, duration: 0.8, stagger: 0.12 }, 0.6);
  }
}
