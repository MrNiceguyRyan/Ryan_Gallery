const JSON_LD_ESCAPE_CHARS = /[<>&\u2028\u2029]/g;

const JSON_LD_ESCAPES = {
  '<': '\\u003C',
  '>': '\\u003E',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(
    JSON_LD_ESCAPE_CHARS,
    (char) => JSON_LD_ESCAPES[char],
  );
}
