const JSON_LD_ESCAPE_MAP = {
  '<': '\\u003C',
  '>': '\\u003E',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Serialize JSON-LD for insertion via Astro's raw `set:html`.
 *
 * Escaping `<` is required because otherwise CMS-controlled text containing
 * `</script>` can close the JSON-LD tag and inject executable markup.
 */
export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => JSON_LD_ESCAPE_MAP[char]);
}
