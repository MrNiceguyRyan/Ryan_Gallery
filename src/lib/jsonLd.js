const ESCAPED_JSON_LD_CHARS = /[<>&\u2028\u2029]/g;

const JSON_LD_ESCAPE_MAP = {
  '<': '\\u003C',
  '>': '\\u003E',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(
    ESCAPED_JSON_LD_CHARS,
    (char) => JSON_LD_ESCAPE_MAP[char],
  );
}
