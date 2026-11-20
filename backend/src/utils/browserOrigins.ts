export function configuredBrowserOrigins() {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((value) => value.trim()).filter(Boolean);
}

export function isValidBrowserOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === origin;
  } catch {
    return false;
  }
}
