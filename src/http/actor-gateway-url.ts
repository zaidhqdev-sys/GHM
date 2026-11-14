export const assertActorGatewayBaseUrl = (value: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Actor gateway URL must be a valid absolute URL');
  }
  const localHttp = parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (
    (parsed.protocol !== 'https:' && !localHttp) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('Actor gateway URL must be a credential-free HTTPS origin (HTTP is allowed only for localhost)');
  }
  return parsed;
};
