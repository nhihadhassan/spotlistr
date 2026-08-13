import "server-only";

import PQueue from "p-queue";
import {
  CookieTokenStore,
  refreshAccessToken,
  type TokenStore,
} from "./tokens";
import type {
  SpotifyPaged,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUser,
} from "./types";

const API = "https://api.spotify.com/v1";

/**
 * Spotify's rate limit is a rolling window and is not documented. Concurrency 4
 * with honest 429 backoff is what keeps a 500-track conversion from failing
 * halfway. Do not raise this "to make it faster" — you will get the whole
 * account rate-limited instead.
 */
const queue = new PQueue({ concurrency: 4, intervalCap: 10, interval: 1000 });

export class SpotifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SpotifyError";
  }
}

/**
 * A Spotify API client bound to one user. All calls go through the shared
 * queue, refresh transparently on 401, and honor Retry-After on 429.
 *
 * Token storage is injected (see TokenStore) so this class doesn't care
 * whether tokens live in a cookie or in Supabase.
 */
export class SpotifyClient {
  private token: string | null = null;

  constructor(private readonly store: TokenStore = new CookieTokenStore()) {}

  private async refresh(refreshToken: string): Promise<string> {
    let tokens;
    try {
      tokens = await refreshAccessToken(refreshToken);
    } catch (err) {
      // The refresh token itself is dead — the user must reconnect.
      throw new SpotifyError(
        err instanceof Error ? err.message : "Spotify session expired",
        401,
      );
    }
    await this.store.save(tokens);
    this.token = tokens.accessToken;
    return tokens.accessToken;
  }

  private async accessToken(): Promise<string> {
    if (this.token) return this.token;

    let tokens;
    try {
      tokens = await this.store.load();
    } catch (err) {
      throw new SpotifyError(
        err instanceof Error ? err.message : "Not connected to Spotify",
        401,
      );
    }

    const expiringSoon =
      tokens.expiresAt !== null && tokens.expiresAt - Date.now() < 60_000;

    if (expiringSoon && tokens.refreshToken) {
      return this.refresh(tokens.refreshToken);
    }

    this.token = tokens.accessToken;
    return this.token;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    attempt = 0,
  ): Promise<T> {
    const token = await this.accessToken();
    const url = path.startsWith("http") ? path : `${API}${path}`;

    const res = await queue.add(() =>
      fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        cache: "no-store",
      }),
    );

    if (!res) {
      throw new SpotifyError("Spotify request was dropped from the queue", 500);
    }

    if (res.status === 401 && attempt === 0) {
      const tokens = await this.store.load();
      if (!tokens.refreshToken) {
        throw new SpotifyError("Spotify session expired", 401);
      }
      await this.refresh(tokens.refreshToken);
      return this.request<T>(path, init, attempt + 1);
    }

    if (res.status === 429 && attempt < 5) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      return this.request<T>(path, init, attempt + 1);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new SpotifyError(
        `Spotify ${res.status} on ${path}: ${body.slice(0, 200)}`,
        res.status,
      );
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // --- reads ---------------------------------------------------------------

  me() {
    return this.request<SpotifyUser>("/me");
  }

  /** Search for tracks. `market=from_token` matters: results differ by region. */
  async searchTracks(query: string, limit = 10): Promise<SpotifyTrack[]> {
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(limit),
      market: "from_token",
    });
    const json = await this.request<{ tracks: SpotifyPaged<SpotifyTrack> }>(
      `/search?${params}`,
    );
    return json.tracks.items;
  }

  /**
   * The user's top tracks or artists. Powers the stats image tool.
   * Ranges are Spotify's: short ≈ 4 weeks, medium ≈ 6 months, long ≈ 1 year.
   */
  async topItems(
    type: "tracks" | "artists",
    range: "short_term" | "medium_term" | "long_term",
    limit: number,
  ): Promise<
    Array<{ name: string; subtitle: string; image: string | null; uri: string }>
  > {
    const params = new URLSearchParams({
      time_range: range,
      limit: String(limit),
    });

    if (type === "tracks") {
      const page = await this.request<SpotifyPaged<SpotifyTrack>>(
        `/me/top/tracks?${params}`,
      );
      return page.items.map((track) => ({
        name: track.name,
        subtitle: track.artists.map((a) => a.name).join(", "),
        image: track.album?.images?.[0]?.url ?? null,
        uri: track.uri,
      }));
    }

    const page = await this.request<
      SpotifyPaged<{
        name: string;
        uri: string;
        genres: string[];
        images: Array<{ url: string }>;
      }>
    >(`/me/top/artists?${params}`);

    return page.items.map((artist) => ({
      name: artist.name,
      subtitle: artist.genres?.slice(0, 2).join(", ") ?? "",
      image: artist.images?.[0]?.url ?? null,
      uri: artist.uri,
    }));
  }

  /** All of the user's playlists, following pagination. */
  async myPlaylists(): Promise<SpotifyPlaylist[]> {
    const all: SpotifyPlaylist[] = [];
    let url: string | null = "/me/playlists?limit=50";

    while (url) {
      const page: SpotifyPaged<SpotifyPlaylist> =
        await this.request<SpotifyPaged<SpotifyPlaylist>>(url);
      all.push(...page.items);
      url = page.next;
    }

    return all;
  }

  /** All tracks in a playlist, following pagination. */
  async playlistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    const all: SpotifyTrack[] = [];
    let url: string | null =
      `/playlists/${playlistId}/tracks?limit=100&market=from_token`;

    while (url) {
      const page: SpotifyPaged<{ track: SpotifyTrack | null }> =
        await this.request<SpotifyPaged<{ track: SpotifyTrack | null }>>(url);
      for (const item of page.items) {
        // Local files and removed tracks come back as null.
        if (item.track) all.push(item.track);
      }
      url = page.next;
    }

    return all;
  }

  // --- writes --------------------------------------------------------------

  async createPlaylist(
    name: string,
    opts: { description?: string; isPublic?: boolean } = {},
  ): Promise<SpotifyPlaylist> {
    const user = await this.me();
    return this.request<SpotifyPlaylist>(`/users/${user.id}/playlists`, {
      method: "POST",
      body: JSON.stringify({
        name,
        description: opts.description ?? "",
        public: opts.isPublic ?? false,
      }),
    });
  }

  /**
   * Adds tracks in batches of 100 (Spotify's hard limit per request).
   * Returns the number actually sent.
   */
  async addTracks(playlistId: string, uris: string[]): Promise<number> {
    for (let i = 0; i < uris.length; i += 100) {
      const batch = uris.slice(i, i + 100);
      await this.request(`/playlists/${playlistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ uris: batch }),
      });
    }
    return uris.length;
  }
}

/** A client for the currently signed-in user, using the cookie session. */
export function spotifyForCurrentUser() {
  return new SpotifyClient(new CookieTokenStore());
}
