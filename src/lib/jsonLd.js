const JSON_LD_ESCAPES = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function serializeJsonLd(schema) {
  return JSON.stringify(schema).replace(/[<>&\u2028\u2029]/g, (char) => JSON_LD_ESCAPES[char]);
}
