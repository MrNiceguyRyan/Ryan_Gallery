/**
 * Serialize structured data for an inline <script> element.
 *
 * JSON.stringify alone is unsafe here because a CMS string containing
 * "</script>" is parsed as HTML and closes the script element. Escaping the
 * HTML-significant characters keeps the value as JSON text.
 */
export function serializeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
