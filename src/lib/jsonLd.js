const ESCAPE_PATTERN = /[<>&\u2028\u2029]/g;

function escapeJsonForHtml(char) {
  switch (char.charCodeAt(0)) {
    case 60:
      return '\\u003C';
    case 62:
      return '\\u003E';
    case 38:
      return '\\u0026';
    case 0x2028:
      return '\\u2028';
    case 0x2029:
      return '\\u2029';
    default:
      return char;
  }
}

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(ESCAPE_PATTERN, escapeJsonForHtml);
}
