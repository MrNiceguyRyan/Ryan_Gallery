const SCRIPT_ESCAPE_REPLACEMENTS = {
  '<': '\\u003C',
  '>': '\\u003E',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

const SCRIPT_ESCAPE_RE = /[<>&\u2028\u2029]/g;

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(
    SCRIPT_ESCAPE_RE,
    (character) => SCRIPT_ESCAPE_REPLACEMENTS[character],
  );
}
