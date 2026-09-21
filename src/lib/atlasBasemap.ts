/**
 * The paper both atlases are printed on.
 *
 * This site draws two Mapbox surfaces — the homepage's scripted route atlas and
 * /travel's geographic index — and they are deliberately the same instrument
 * seen twice: white ink on the same graded ground, one arrival ring, places
 * named once. That vocabulary was unified by hand in two files, which is a
 * promise nobody can keep: the next chapter added, or the next colour tweak,
 * drifts them apart in a way no test would catch.
 *
 * What lives here is only what BOTH surfaces must agree on. The grading itself
 * stays in each component, because they are not the same treatment: the route
 * atlas dims its ground far harder, carries hillshade, fog and a road
 * hierarchy, and reshapes all of it again for the mobile living tree.
 */

/** Ground tones. Shared because a visitor moving between the two surfaces is
 *  looking at the same territory, and the ground must not change colour. */
export const ATLAS_PAPER = {
  /** The field behind everything. The living (mobile) tree goes darker still. */
  background: '#1B2319',
  backgroundLiving: '#0F130E',
  water: '#0B1210',
  land: '#263024',
  building: '#2A3028',
} as const;

/**
 * A place on these maps is named ONCE, by the archive.
 *
 * Every marked city is also a city in Mapbox's own settlement labels, and the
 * basemap sets its label on the opposite side of the point from ours — so a
 * place ends up captioned twice, forty pixels apart, in two different type
 * treatments. (On /travel this only became visible when the markers' opaque
 * plates were removed; the plates had been hiding it.)
 *
 * So the basemap is asked not to name the places the archive is naming. Every
 * other settlement it draws is context and stays: these maps are worth reading
 * precisely because Toronto, Chicago and Atlanta are on them.
 */
export function silenceArchivePlaceLabels(map: any, names: string[]) {
  const wanted = names.map((name) => name?.trim()).filter(Boolean);
  if (!wanted.length) return;
  const exclude: any = ['!', ['in', ['coalesce', ['get', 'name_en'], ['get', 'name']], ['literal', wanted]]];
  map.getStyle?.()?.layers?.forEach((layer: any) => {
    if (layer.type !== 'symbol') return;
    const id = layer.id.toLowerCase();
    if (!id.includes('settlement') && !id.includes('place')) return;
    try {
      // Marked once so a re-apply cannot nest `all` filters on every style load.
      if (layer.metadata?.archiveSilenced) return;
      const existing = map.getFilter(layer.id);
      map.setFilter(layer.id, existing ? ['all', existing, exclude] : exclude);
      if (layer.metadata) layer.metadata.archiveSilenced = true;
    } catch {
      // A style whose filter cannot be composed keeps its own labels; the
      // doubling is a blemish, a thrown error in the load path is not.
    }
  });
}
