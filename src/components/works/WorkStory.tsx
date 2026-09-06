import { useEffect, useRef } from 'react';
import { navigate } from 'astro:transitions/client';
import MagazineLayout from '../home/MagazineLayout';
import type { Collection } from '../../types';

/**
 * WorkStory — renders the SAME MagazineLayout story experience used by the
 * homepage overlay, but as a standalone /works/[slug] page. This keeps the
 * "open a collection story" experience identical whether the visitor arrives
 * from the homepage (in-app overlay) or from the Map's "Explore Story" link
 * (full-page navigation). Homepage is the baseline.
 *
 * Navigation-based equivalents of the overlay callbacks:
 *   - Keep Reading (onSelectCollection) → navigate to that work's page
 *   - Back (onClose)                    → return to where the visitor came
 *     from, falling back to the homepage
 */
export default function WorkStory({
  collection,
  allCollections,
}: {
  collection: Collection;
  allCollections: Collection[];
}) {
  const navigationPendingRef = useRef(false);

  // The MagazineLayout fills the viewport with its own internal scroll, so
  // lock the page body to avoid a second scrollbar.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHtmlBackground = document.documentElement.style.backgroundColor;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.backgroundColor = '#30352a';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.backgroundColor = prevHtmlBackground;
    };
  }, []);

  const returnToPreviousPage = () => {
    // The outgoing Story remains clickable while Astro prepares the next
    // page. A second Back must not traverse past the Map the first one chose.
    if (navigationPendingRef.current) return;
    navigationPendingRef.current = true;
    // Astro increments this index for its client-side history entries, while
    // document.referrer remains fixed at the initial page load. Preserve the
    // actual Map -> Story path rather than sending those visitors to Home.
    const clientHistoryIndex = window.history.state?.index;
    const hasClientHistory = typeof clientHistoryIndex === 'number' && clientHistoryIndex > 0;
    let sameSiteReferrer = false;
    try {
      sameSiteReferrer = Boolean(document.referrer)
        && new URL(document.referrer).origin === window.location.origin;
    } catch {
      sameSiteReferrer = false;
    }
    if (hasClientHistory || sameSiteReferrer) window.history.back();
    else void navigate('/').catch(() => { navigationPendingRef.current = false; });
  };

  return (
    <MagazineLayout
      collection={collection}
      allCollections={allCollections}
      onSelectCollection={(c) => {
        if (c.slug) void navigate(`/works/${c.slug}`);
      }}
      onClose={returnToPreviousPage}
      mainId="main-content"
      standalone
      canonicalUrl={`/works/${collection.slug}`}
    />
  );
}
