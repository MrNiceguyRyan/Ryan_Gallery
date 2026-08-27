export function serializeJsonLd(value) {
  const json = JSON.stringify(value);

  if (json === undefined) {
    return 'null';
  }

  return json.replace(/</g, '\\u003c');
}
