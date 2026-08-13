import { NextResponse, type NextRequest } from "next/server";
import { setOAuthState } from "@/lib/session";
import { spotifyRedirectUri } from "@/lib/site-url";

/**
 * Starts the Spotify Authorization Code flow.
 *
 * We're a confidential client — the code exchange happens server-side with the
 * client secret — so PKCE isn't required here. The `state` parameter is, and
 * it's checked in the callback.
 */
const SCOPES = [
  "playlist-modify-public",
  "playlist-modify-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  // "ugc-image-upload" is only needed for the Phase 5 cover uploader. Adding a
  // scope later forces every existing user to re-consent, so think before
  // trimming this list — but don't request what you don't use either.
].join(" ");

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/convert";

  if (!process.env.SPOTIFY_CLIENT_ID) {
    return NextResponse.redirect(`${origin}/auth/error?reason=not_configured`);
  }

  const state = await setOAuthState(next);

  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    // Must match a redirect URI registered in the Spotify dashboard EXACTLY.
    // Note Spotify rejects `localhost` — use http://127.0.0.1:3000 in dev.
    redirect_uri: spotifyRedirectUri(origin),
    scope: SCOPES,
    state,
    show_dialog: "false",
  });

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params}`,
  );
}
