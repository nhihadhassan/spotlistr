import { NextResponse, type NextRequest } from "next/server";
import { consumeOAuthState, setSession } from "@/lib/session";
import { spotifyRedirectUri } from "@/lib/site-url";
import type { SpotifyUser } from "@/lib/spotify/types";

/**
 * Spotify OAuth callback. Exchanges the code for tokens, fetches the user's
 * identity, and writes the signed session cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    // The user clicked "Cancel" on the consent screen, most likely.
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const { valid, next } = await consumeOAuthState(state);
  if (!valid) {
    // Either a CSRF attempt or a stale/reused callback URL.
    return NextResponse.redirect(`${origin}/auth/error?reason=bad_state`);
  }

  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      // Must be byte-identical to the one sent in the authorize request.
      redirect_uri: spotifyRedirectUri(origin),
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => "");
    console.error("Spotify token exchange failed:", detail);
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange_failed`);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
  });

  if (!meRes.ok) {
    return NextResponse.redirect(`${origin}/auth/error?reason=profile_failed`);
  }

  const me = (await meRes.json()) as SpotifyUser;

  await setSession({
    userId: me.id,
    displayName: me.display_name,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });

  return NextResponse.redirect(`${origin}${next}`);
}
