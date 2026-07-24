/**
 * Serialize a JSON-LD value for safe embedding in
 * <script type="application/ld+json"> via Astro `set:html`.
 *
 * `JSON.stringify` alone is not HTML-safe: a CMS string containing
 * `</script>` (or `<!--`) breaks out of the script element and can
 * execute attacker-controlled markup/JS.
 */
export function serializeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
