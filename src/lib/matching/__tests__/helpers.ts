import type { SpotifyTrack } from "@/lib/spotify/types";
import type { ParsedTrack } from "../parse";

let counter = 0;

/** Builds a SpotifyTrack with sensible defaults, for tests. */
export function track(
  name: string,
  artists: string | string[],
  overrides: Partial<SpotifyTrack> = {},
): SpotifyTrack {
  const id = `t${counter++}`;
  const artistNames = Array.isArray(artists) ? artists : [artists];

  return {
    id,
    uri: `spotify:track:${id}`,
    name,
    duration_ms: 200_000,
    explicit: false,
    popularity: 50,
    album: {
      id: `a${id}`,
      name: "An Album",
      images: [],
      release_date: "2000-01-01",
      release_date_precision: "day",
    },
    artists: artistNames.map((n, i) => ({ id: `ar${id}-${i}`, name: n })),
    ...overrides,
  };
}

/** Builds a ParsedTrack query. */
export function query(
  artist: string,
  title: string,
  overrides: Partial<ParsedTrack> = {},
): ParsedTrack {
  return {
    artist,
    title,
    raw: `${artist} - ${title}`,
    ambiguousOrder: false,
    ...overrides,
  };
}
