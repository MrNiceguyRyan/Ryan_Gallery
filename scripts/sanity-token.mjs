export function getRequiredSanityToken() {
  const token = process.env.SANITY_TOKEN?.trim();

  if (!token) {
    throw new Error('SANITY_TOKEN environment variable is required for Sanity write scripts.');
  }

  return token;
}
