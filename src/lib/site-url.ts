/**
 * The canonical origin for this deployment.
 *
 * This must be stable, because the Spotify redirect URI has to match a value
 * registered in the developer dashboard *exactly*. Deriving it from the
 * incoming request works locally but breaks on Vercel, where every preview
 * deployment gets its own hostname — the callback would be rejected on all of
 * them. So: an explicit env var wins, and the request origin is only a
 * fallback for local development.
 */
export function siteUrl(requestOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // Vercel sets this automatically, but it's the per-deployment hostname —
  // only useful as a last resort before falling back to the request itself.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (requestOrigin) return requestOrigin.replace(/\/$/, "");

  return "http://127.0.0.1:3000";
}

/** The Spotify redirect URI. Must match the dashboard registration exactly. */
export function spotifyRedirectUri(requestOrigin?: string): string {
  return `${siteUrl(requestOrigin)}/auth/callback`;
}
