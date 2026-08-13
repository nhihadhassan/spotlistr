import "server-only";

import { getSession, setSession } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase/server";

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms, or null when unknown. */
  expiresAt: number | null;
};

/**
 * Where a user's Spotify tokens live.
 *
 * Two implementations exist because auth is mid-migration: the cookie store is
 * what runs today with Supabase switched off, and the Supabase store is what
 * takes over once it's on. SpotifyClient depends on this interface and not on
 * either one, so flipping between them is a one-line change at the call site.
 */
export interface TokenStore {
  load(): Promise<TokenSet>;
  save(tokens: TokenSet): Promise<void>;
}

/** Tokens in the signed session cookie. Development-stage default. */
export class CookieTokenStore implements TokenStore {
  async load(): Promise<TokenSet> {
    const session = await getSession();
    if (!session) {
      throw new Error("Not signed in");
    }
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    };
  }

  async save(tokens: TokenSet): Promise<void> {
    const session = await getSession();
    if (!session) return;
    await setSession({
      ...session,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? session.refreshToken,
      expiresAt: tokens.expiresAt ?? Date.now() + 3600 * 1000,
    });
  }
}

/**
 * Tokens in the `connections` table. Reads with the service role because that
 * table intentionally has no user-facing select policy — see the migration.
 */
export class SupabaseTokenStore implements TokenStore {
  constructor(private readonly userId: string) {}

  async load(): Promise<TokenSet> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("connections")
      .select("access_token, refresh_token, expires_at")
      .eq("user_id", this.userId)
      .eq("provider", "spotify")
      .single();

    if (error || !data) throw new Error("No Spotify connection for this user");

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : null,
    };
  }

  async save(tokens: TokenSet): Promise<void> {
    const supabase = createServiceClient();
    await supabase
      .from("connections")
      .update({
        access_token: tokens.accessToken,
        ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
        expires_at: tokens.expiresAt
          ? new Date(tokens.expiresAt).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", this.userId)
      .eq("provider", "spotify");
  }
}

/**
 * Exchanges a refresh token for a fresh access token.
 *
 * Spotify only sometimes rotates the refresh token; when it doesn't, the old
 * one stays valid and must be kept.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenSet> {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Spotify session expired, please sign in again");
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}
