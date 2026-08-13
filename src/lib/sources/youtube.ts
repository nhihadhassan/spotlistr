import { z } from "zod";
import { parseLine, type ParsedTrack } from "@/lib/matching/parse";
import type { SourceAdapter, SourceResult } from "./types";

const configSchema = z.object({
  url: z.string().min(1, "Paste a YouTube playlist URL"),
});

type Config = z.infer<typeof configSchema>;

/** Pulls the playlist id out of any of YouTube's URL shapes. */
export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();

  // A bare id.
  if (/^[A-Za-z0-9_-]{12,}$/.test(trimmed) && !trimmed.includes("/")) {
    return trimmed;
  }

  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    return url.searchParams.get("list");
  } catch {
    return null;
  }
}

type PlaylistItem = {
  snippet?: {
    title?: string;
    videoOwnerChannelTitle?: string;
    channelTitle?: string;
    resourceId?: { videoId?: string };
  };
};

/**
 * YouTube video titles are the messiest input we handle: the "artist" is
 * often only in the channel name, and the title carries every kind of noise.
 * We lean on the same parser as the textbox source, then fall back to the
 * channel name when the title has no separator in it.
 */
function toTrack(item: PlaylistItem): ParsedTrack | null {
  const title = item.snippet?.title?.trim();
  if (!title) return null;

  // Deleted and private videos still occupy a slot, with a placeholder title.
  if (title === "Deleted video" || title === "Private video") return null;

  const parsed = parseLine(title);
  if (!parsed) return null;

  if (!parsed.artist) {
    // No separator in the title. The uploading channel is the best guess —
    // "Artist - Topic" auto-generated channels are especially reliable.
    const channel =
      item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle ?? "";
    const artist = channel.replace(/\s*-\s*Topic$/i, "").trim();
    if (artist) {
      return { ...parsed, artist, ambiguousOrder: false };
    }
  }

  return parsed;
}

export const youtubeSource: SourceAdapter<Config> = {
  id: "youtube",
  label: "YouTube playlist",
  description: "Import from a public YouTube playlist",
  authRequired: "none",
  configSchema,
  input: {
    kind: "url",
    label: "YouTube playlist URL",
    placeholder: "https://www.youtube.com/playlist?list=PL...",
    help: "The playlist must be public or unlisted.",
  },
  async fetch(config): Promise<SourceResult> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "YouTube isn't configured on this server (YOUTUBE_API_KEY is missing).",
      );
    }

    const playlistId = extractPlaylistId(config.url);
    if (!playlistId) {
      throw new Error(
        "That doesn't look like a YouTube playlist URL — it needs a ?list= parameter.",
      );
    }

    const tracks: ParsedTrack[] = [];
    const rejected: string[] = [];
    let pageToken: string | undefined;

    // Paginate. 50 is the API maximum per page; each call costs 1 quota unit
    // against a 10,000/day default.
    do {
      const params = new URLSearchParams({
        part: "snippet",
        maxResults: "50",
        playlistId,
        key: apiKey,
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?${params}`,
        { cache: "no-store" },
      );

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("That playlist doesn't exist or isn't public.");
        }
        if (res.status === 403) {
          throw new Error(
            "YouTube rejected the request — the API key may be out of daily quota.",
          );
        }
        throw new Error(`YouTube returned ${res.status}.`);
      }

      const json = (await res.json()) as {
        items?: PlaylistItem[];
        nextPageToken?: string;
      };

      for (const item of json.items ?? []) {
        const track = toTrack(item);
        if (track) {
          tracks.push(track);
        } else if (item.snippet?.title) {
          rejected.push(item.snippet.title);
        }
      }

      pageToken = json.nextPageToken;
    } while (pageToken);

    return { tracks, rejected };
  },
};
