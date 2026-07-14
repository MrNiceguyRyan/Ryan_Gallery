import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Colophon — the homepage's closing chapter, driven by GSAP ScrollTrigger.
 *
 * The signature "Ryan" is a real SVG that DRAWS ITSELF stroke-by-stroke as you
 * scroll through this section (strokeDashoffset scrubbed to scroll progress);
 * the statement + columns reveal on enter. Fully isolated from the homepage's
 * framer-motion / Lenis (its own island, its own scoped GSAP context) so the
 * two animation systems never fight over the same elements. Lenis drives the
 * real window scroll, which ScrollTrigger reads. All motion is gated behind
 * gsap.matchMedia('no-preference'); reduced-motion users get the final,
 * fully-drawn state with no animation.
 */

const SIG_STROKES = [
  // main word — one continuous cursive scribble (R → y → a → n), ends in its own flick
  'M30,95 C34,60 44,26 58,22 C72,18 74,40 60,55 C52,63 44,66 38,66 C60,70 78,74 92,72 C104,70 112,60 116,50 C118,64 118,78 112,92 C106,108 92,116 84,108 C78,100 88,88 102,82 C118,74 130,70 142,72 C154,74 158,84 154,92 C150,98 140,98 138,90 C140,78 150,72 162,70 C176,68 184,76 184,88 C184,94 182,96 180,92 C182,80 190,70 202,68 C216,66 222,76 220,90 C226,80 238,68 250,58',
  // underline flourish
  'M40,112 C100,124 200,124 268,104',
];

const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const EMAIL = 'ryan2420159421@gmail.com';
const INSTAGRAM = 'https://www.instagram.com/ryan_photoo/';

export default function Colophon() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // ── Signature: draw each stroke as you scroll through the section ──
        const paths = gsap.utils.toArray<SVGPathElement>('.sig-path');
        paths.forEach((p) => {
          const len = p.getTotalLength();
          gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
        });
        gsap.to('.sig-path', {
          strokeDashoffset: 0,
          ease: 'none',
          stagger: 0.6,
          scrollTrigger: {
            trigger: root.current,
            start: 'top 78%',
            end: 'bottom bottom',
            scrub: 1, // pen follows the scrollbar, catching up over ~1s
          },
        });

        // ── Statement + columns: rise + fade in once, staggered, on enter ──
        gsap.from('.colophon-reveal', {
          y: 40,
          autoAlpha: 0,
          duration: 1.1,
          ease: 'power3.out',
          stagger: 0.1,
          scrollTrigger: { trigger: root.current, start: 'top 68%', once: true },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative mt-16 md:mt-24 px-3 md:px-6">
      <div className="relative rounded-t-[2.5rem] md:rounded-t-[5rem] bg-[#20241a] ring-1 ring-white/[0.05] overflow-hidden px-6 md:px-14 pt-16 md:pt-24 pb-6">
        {/* Signature draws on scroll, sitting above the statement */}
        <div className="colophon-reveal relative z-10 flex justify-center">
          <svg
            viewBox="0 0 300 140"
            fill="none"
            aria-hidden
            className="w-[clamp(150px,20vw,240px)] -rotate-6"
            style={{ overflow: 'visible', filter: 'drop-shadow(0 0 7px rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.3))' }}
          >
            {SIG_STROKES.map((d, i) => (
              <path key={i} className="sig-path" d={d} stroke={LIME} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </svg>
        </div>

        {/* Statement */}
        <h2 className="colophon-reveal relative z-10 text-center font-ui font-bold uppercase tracking-[-0.02em] leading-[0.96] text-[#F4F4ED] mt-1" style={{ fontSize: 'clamp(40px, 6.4vw, 96px)' }}>
          Always <span className="font-serif italic font-normal" style={{ color: '#b2c73a' }}>chasing</span>
          <br />
          the <span className="font-serif italic font-normal" style={{ color: LIME }}>light.</span>
        </h2>

        {/* Columns — PAGES | GET IN TOUCH | FOLLOW ON */}
        <div className="colophon-reveal relative z-10 mt-14 md:mt-16 grid grid-cols-2 md:grid-cols-3 gap-y-10 items-center">
          <div className="text-center md:text-left md:pl-[8%]">
            <p className="font-ui text-[9px] tracking-[0.4em] uppercase text-white/30 mb-4">Pages</p>
            <ul className="space-y-1.5 font-ui font-bold uppercase tracking-[0.08em] text-lg md:text-xl text-white/85">
              {[['Home', '/'], ['Map', '/travel'], ['About', '/about']].map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="inline-block transition-colors duration-300 hover:text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]">{label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="order-last md:order-none col-span-2 md:col-span-1 flex justify-center">
            <a
              href={`mailto:${EMAIL}`}
              className="group inline-flex items-center gap-2 px-7 py-3 rounded-full text-[12px] font-bold tracking-[0.18em] uppercase text-[#111112] transition-[scale] duration-300 hover:scale-[1.03] active:scale-[0.98]"
              style={{ background: LIME }}
            >
              Get in touch
              <span aria-hidden className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
            </a>
          </div>

          <div className="text-center md:text-right md:pr-[8%]">
            <p className="font-ui text-[9px] tracking-[0.4em] uppercase text-white/30 mb-4">Follow on</p>
            <ul className="space-y-1.5 font-ui font-bold uppercase tracking-[0.08em] text-lg md:text-xl text-white/85">
              <li><a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="inline-block transition-colors duration-300 hover:text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]">Instagram</a></li>
              <li><a href={`mailto:${EMAIL}`} className="inline-block transition-colors duration-300 hover:text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]">Email</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="colophon-reveal relative z-10 mt-14 pt-5 border-t border-white/10 flex flex-col md:flex-row gap-2 items-center justify-between font-ui text-[9px] tracking-[0.25em] uppercase text-white/30">
          <span>© {new Date().getFullYear()} Ryan Xu. All rights reserved.</span>
          <a href="/" className="hover:text-white/60 transition-colors duration-300">ryanxugallery.com</a>
        </div>
      </div>
    </section>
  );
}
