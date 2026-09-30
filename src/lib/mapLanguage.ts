// ── The map's own labels follow 中 / EN ──
// Owner, 2026-09-28: the Mapbox basemap's place names switch to Chinese
// (zh-Hans) in Chinese mode. Both atlases use mapbox/dark-v11, whose labels
// read `name_en` / `name` from Mapbox Streets v8 tiles; the tiles also carry
// `name_zh-Hans` (and `name_zh`), so a label is localised by rewriting its
// text-field expression — every `["get","name_en"]` / `["get","name"]` in it
// becomes "the Simplified Chinese name if the tile has one, else what it was"
// — and put back from the kept original in English. No style reload, no new
// tiles, no glyph download: mapbox-gl draws Han glyphs with a local font
// (localIdeographFontFamily). Road shields' `ref` numbers are left alone.
//
// Usage (once the style has loaded): const unbind = bindMapLanguage(map);
// ...and unbind() on unmount. It applies the page's language now, again after
// any style (re)load, and on every toggle.

import { getLang, subscribeLang, type Lang } from '../i18n/lang.ts';

type Expression = unknown;
/** The few map methods used, as method signatures (so mapbox-gl's own
 *  typed Map, whose parameters are narrower, is accepted as it is). */
interface MapLike {
  getStyle(): { layers?: Array<{ id: string; type: string; layout?: unknown }> } | undefined | null;
  getLayoutProperty?(id: string, name: string): unknown;
  setLayoutProperty(id: string, name: string, value: unknown): unknown;
  on?(type: string, listener: () => void): unknown;
  off?(type: string, listener: () => void): unknown;
}

const NAME_FIELDS = new Set(['name', 'name_en']);
const ZH_FIELDS = ['name_zh-Hans', 'name_zh'];

/** A text-field expression with its name reads localised to Chinese. */
export function localiseTextField(expression: Expression): Expression {
  if (Array.isArray(expression)) {
    if (expression.length === 2 && expression[0] === 'get' && typeof expression[1] === 'string' && NAME_FIELDS.has(expression[1])) {
      return ['coalesce', ...ZH_FIELDS.map((field) => ['get', field]), expression];
    }
    return expression.map((part) => localiseTextField(part));
  }
  if (typeof expression === 'string' && /\{name(_en)?\}/.test(expression)) {
    // A legacy token string cannot coalesce: the Chinese name, where there
    // is one (Streets v8 carries name_zh-Hans for every place worth naming).
    return expression.replace(/\{name(_en)?\}/g, '{name_zh-Hans}');
  }
  return expression;
}

/** Whether an expression reads a name at all (a road's `ref` does not). */
export function readsName(expression: Expression): boolean {
  if (Array.isArray(expression)) {
    if (expression[0] === 'get' && typeof expression[1] === 'string' && NAME_FIELDS.has(expression[1])) return true;
    return expression.some((part) => readsName(part));
  }
  return typeof expression === 'string' && /\{name(_en)?\}/.test(expression);
}

const originals = new WeakMap<object, Map<string, Expression>>();

/** Put every name label of a loaded style into a language. */
export function applyMapLanguage(map: MapLike, lang: Lang) {
  const layers = map.getStyle()?.layers;
  if (!layers) return;
  let kept = originals.get(map);
  if (!kept) {
    kept = new Map();
    originals.set(map, kept);
  }
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue;
    const current = map.getLayoutProperty ? map.getLayoutProperty(layer.id, 'text-field') : (layer.layout as Record<string, unknown> | undefined)?.['text-field'];
    if (current == null) continue;
    if (!kept.has(layer.id)) {
      if (!readsName(current)) continue;
      kept.set(layer.id, current);
    }
    const original = kept.get(layer.id);
    const next = lang === 'zh' ? localiseTextField(original) : original;
    try {
      map.setLayoutProperty(layer.id, 'text-field', next);
    } catch {
      // A layer that refuses the expression keeps its English: a label in
      // the wrong language is a blemish, a thrown error in the map is not.
    }
  }
}

/** Keep a map's labels in the page's language from now on. */
export function bindMapLanguage(map: MapLike): () => void {
  const apply = () => applyMapLanguage(map, getLang());
  // A style that reloads (setStyle) comes back in English: apply again.
  const onStyle = () => {
    originals.delete(map);
    apply();
  };
  apply();
  map.on?.('style.load', onStyle);
  const unsubscribe = subscribeLang(apply);
  return () => {
    unsubscribe();
    map.off?.('style.load', onStyle);
  };
}
