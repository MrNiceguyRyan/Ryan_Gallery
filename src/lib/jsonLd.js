const JSON_LD_ESCAPES = {
  '<': '\\u003C',
  '>': '\\u003E',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Serialize JSON-LD for an inline <script> tag.
 *
 * JSON.stringify alone can leave a literal </script> in CMS-controlled text,
 * which lets the browser terminate the script tag and parse attacker HTML.
 */
export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => JSON_LD_ESCAPES[char]);
}
