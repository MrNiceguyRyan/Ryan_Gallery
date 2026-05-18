import type { PortableTextBlock } from '../types';

/**
 * Per-collection editorial fallbacks. Used when Sanity has no
 * `introduction` field populated. Keyed by collection slug.
 *
 * These are kept in sync between MagazineLayout (homepage overlay)
 * and WorkDetailPage (full /works/[slug] page) so both surfaces
 * read the same narrative without duplication.
 */
export const EDITORIAL_FALLBACKS: Record<string, string[]> = {
  'new-york-stories': [
    'Manhattan light arrives sideways in the early hours, cutting between towers in long amber slabs that catch the steam rising from grates and the grime on fire escapes. By mid-morning the city is already hard-edged, every surface asserting itself.',
    'Dusk compresses the borough into silhouette: water towers against violet sky, headlights smearing the wet street into something almost painterly. There is no softness here, only different kinds of contrast.',
  ],
  'page': [
    'Inside Antelope Canyon the sandstone narrows until sound itself seems muffled. The walls have been smoothed by centuries of flash floods into curves that read more like fabric than rock — ochre folding into deep burgundy wherever a shaft of noon light finds the floor.',
    'That light lasts minutes. It enters as a column, diffuse at the edges, and illuminates suspended dust so finely that the air appears solid. What remains is pure geological time rendered in color.',
  ],
  'zion-national-park': [
    'The Virgin River runs cold and milky green through the canyon bottom, its sound constant and indifferent to the walls rising nearly a thousand meters on either side. In morning shadow the sandstone is the color of dried blood; by noon it goes copper.',
    'What Zion enforces is a reckoning with scale. A single wall of Navajo sandstone erases the horizon and replaces it with texture — cross-bedded strata reading like handwriting from some earlier world.',
  ],
  'arizona': [
    'The Sonoran at midday offers almost nothing to hide behind. Saguaro cast shadows barely wider than a hand, and the sky is so bleached it reads white rather than blue. The silence here has weight — oppressive to some, clarifying to others.',
    'Dawn is the negotiation: the moment when the land is still cool and the light has not yet gone harsh, when long shadows of rock formations stretch west and the desert floor shows all its texture.',
  ],
  'orlando': [
    'Florida afternoon light is relentless and democratic — it flattens shadows, bleaches signage, and turns every surface equally bright. In the parks it catches the spray of fountains in small prismatic bursts, indifferent to anything beneath it.',
    'Away from the spectacle, Orlando is a city of retention ponds and palm trees bending in afternoon thunderstorm wind while the pavement still steams. The transition between the engineered and the accidental happens fast here.',
  ],
  'bryce-canyon-national-park': [
    'The hoodoos at Bryce form a kind of frozen congregation — thousands of pink limestone spires standing close together, the tallest capped with harder dolomite that protected them while everything around eroded away. In fresh snow they are almost surreal.',
    'Sunrise on the rim produces the most compressed range of tone — deep blue shadow filling the canyon floor, the spires above catching first light in amber and rust, the sky at the horizon going briefly gold before the whole amphitheater normalizes.',
  ],
  'miami': [
    'Ocean Drive at dusk exists in two registers simultaneously: the pastel geometry of Art Deco facades going soft in the last natural light, and the neon beginning its slow assertion against the darkening sky. The sidewalk retains the day\'s heat long after the sun has gone.',
    'South Beach operates on a logic of surfaces — the gloss of a rental car hood, reflections in hotel lobby glass, the particular turquoise of the Atlantic at noon when the sand below is still visible and the water seems lit from within.',
  ],
};

/**
 * Render Sanity Portable Text into React nodes.
 *
 * Supports plain paragraphs, blockquote, `em` and `strong` inline marks.
 * Caller controls outer container styling — this just emits <p> / <blockquote>.
 *
 * @param blockquoteBorderColor Tailwind class fragment to color the blockquote
 *        accent line. Defaults to a neutral white/10 so it works on dark
 *        backgrounds. Pass `"border-black/10"` on light pages.
 */
export function renderPortableText(
  blocks: PortableTextBlock[],
  blockquoteBorderColor = 'border-white/10',
): React.ReactNode {
  return blocks.map((block) => {
    const text = block.children.map((span) => {
      let node: React.ReactNode = span.text;
      if (span.marks?.includes('em')) node = <em key={span._key}>{node}</em>;
      if (span.marks?.includes('strong')) node = <strong key={span._key}>{node}</strong>;
      return node;
    });
    if (block.style === 'blockquote') {
      return (
        <blockquote
          key={block._key}
          className={`border-l-2 ${blockquoteBorderColor} pl-4 my-4 italic opacity-60`}
        >
          {text}
        </blockquote>
      );
    }
    return (
      <p key={block._key} className="mb-4 last:mb-0">
        {text}
      </p>
    );
  });
}

/** Render the fallback plain-string paragraphs (no inline marks). */
export function renderFallback(paragraphs: string[]): React.ReactNode {
  return paragraphs.map((p, i) => (
    <p key={i} className="mb-4 last:mb-0">{p}</p>
  ));
}
