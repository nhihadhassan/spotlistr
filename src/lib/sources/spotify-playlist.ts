import { z } from "zod";
import { spotifyForCurrentUser } from "@/lib/spotify/client";
import type { ParsedTrack } from "@/lib/matching/parse";
import type { SourceAdapter, SourceResult } from "./types";

const configSchema = z.object({
  playlistId: z.string().min(1, "Choose a playlist"),
});

type Config = z.infer<typeof configSchema>;

/** Accepts a playlist id, a spotify: URI, or an open.spotify.com URL. */
export function extractSpotifyPlaylistId(input: string): string | null {
  const trimmed = input.trim();

  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uriMatch) return uriMatch[1];

  const urlMatch = trimmed.match(/playlist\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];

  if (/^[A-Za-z0-9]{16,}$/.test(trimmed)) return trimmed;

  return null;
}

export const spotifyPlaylistSource: SourceAdapter<Config> = {
  id: "spotify",
  label: "A Spotify playlist",
  description: "One of your own playlists — useful for exporting",
  authRequired: "spotify",
  configSchema,
  input: {
    kind: "playlist-picker",
    label: "Which playlist?",
  },
  async fetch(config): Promise<SourceResult> {
    const id = extractSpotifyPlaylistId(config.playlistId) ?? config.playlistId;
    const spotify = spotifyForCurrentUser();
    const spotifyTracks = await spotify.playlistTracks(id);

    // These come from Spotify, so they're already exact. Carrying the ISRC
    // through means re-matching them is a guaranteed hit rather than a guess.
    const tracks: ParsedTrack[] = spotifyTracks.map((track) => ({
      artist: track.artists.map((a) => a.name).join(", "),
      title: track.name,
      raw: `${track.artists.map((a) => a.name).join(", ")} - ${track.name}`,
      ambiguousOrder: false,
      album: track.album?.name,
      durationMs: track.duration_ms,
      isrc: track.external_ids?.isrc,
    }));

    return { tracks, rejected: [] };
  },
};
