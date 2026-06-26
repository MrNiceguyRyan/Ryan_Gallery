import { useEffect, useRef } from 'react';
import { startAtmosphere } from '../../lib/atmosphere';

/**
 * SiteAtmosphere — the shared cool-dark backdrop behind page content. A canvas
 * draws an animated topographic field (flowing contour ridges + breathing
 * concentric ripples) in the sky-blue accent; the cool corner glows come from
 * the `.site-atmos` CSS. Drawing/motion lives in lib/atmosphere.ts. Used by the
 * homepage and about page (travel.astro mounts the same canvas + script).
 */
export default function SiteAtmosphere() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return startAtmosphere(ref.current);
  }, []);
  return <canvas ref={ref} className="site-atmos" aria-hidden="true" />;
}
