import "server-only";

const API = "https://ws.audioscrobbler.com/2.0/";

export type LastFmPeriod =
  | "7day"
  | "1month"
  | "3month"
  | "6month"
  | "12month"
  | "overall";

export const PERIOD_LABELS: Record<LastFmPeriod, string> = {
  "7day": "Last 7 days",
  "1month": "Last month",
  "3month": "Last 3 months",
  "6month": "Last 6 months",
  "12month": "Last year",
  overall: "All time",
};

export type TopAlbum = {
  name: string;
  artist: string;
  playcount: number;
  image: string | null;
};

export class LastFmError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LastFmError";
  }
}

type RawAlbum = {
  name?: string;
  artist?: { name?: string };
  playcount?: string;
  image?: Array<{ "#text"?: string; size?: string }>;
};

/**
 * A user's top albums. No user auth needed — Last.fm profiles are public and
 * this is a read-only API-key call, which is why this tool works without a
 * sign-in and makes a good top-of-funnel piece.
 */
export async function getTopAlbums(
  user: string,
  period: LastFmPeriod,
  limit: number,
): Promise<TopAlbum[]> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    throw new LastFmError(
      "Last.fm isn't configured on this server (LASTFM_API_KEY is missing).",
      501,
    );
  }

  const params = new URLSearchParams({
    method: "user.gettopalbums",
    user,
    period,
    limit: String(limit),
    api_key: apiKey,
    format: "json",
  });

  const res = await fetch(`${API}?${params}`, { cache: "no-store" });
  const json = await res.json();

  // Last.fm returns HTTP 200 with an error body for unknown users.
  if (json.error) {
    if (json.error === 6) {
      throw new LastFmError(`No Last.fm user called “${user}”.`, 404);
    }
    throw new LastFmError(json.message ?? "Last.fm request failed", 502);
  }

  const albums: RawAlbum[] = json.topalbums?.album ?? [];

  return albums.map((album) => ({
    name: album.name ?? "",
    artist: album.artist?.name ?? "",
    playcount: Number(album.playcount ?? 0),
    // Last.fm returns several sizes; the largest is last and often "".
    image:
      album.image?.filter((i) => i["#text"]).at(-1)?.["#text"] ?? null,
  }));
}
