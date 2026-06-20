/* ============================================================
   Effect · Theme switch (动效 7 base)
   Each section declares data-theme="dark|light". As it crosses the
   viewport middle, the body background + text colour cross-fade,
   so the whole page breathes between pure black and pure white
   with no hard flash. ScrollTrigger-driven (works with Lenis).
   ============================================================ */
const THEMES = {
  dark: { bg: '#000000', fg: '#ffffff' },
  light: { bg: '#ffffff', fg: '#000000' },
};

export function initThemeSwitch({ gsap, ScrollTrigger }) {
  const sections = gsap.utils.toArray('[data-theme]');

  sections.forEach((section) => {
    const theme = THEMES[section.dataset.theme] || THEMES.dark;

    const apply = () =>
      gsap.to('body', {
        backgroundColor: theme.bg,
        color: theme.fg,
        duration: 0.6,
        ease: 'power2.out',
        overwrite: 'auto',
      });

    ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 45%',
      onEnter: apply,
      onEnterBack: apply,
    });
  });
}
