export function requireSanityToken(scriptName) {
  const token = process.env.SANITY_TOKEN;

  if (!token) {
    console.error(`${scriptName} requires SANITY_TOKEN to be set in the environment.`);
    console.error('Create a Sanity API token with the minimum required permissions and run again.');
    process.exit(1);
  }

  return token;
}
