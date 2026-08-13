import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { spotifyForCurrentUser, SpotifyError } from "@/lib/spotify/client";
import { runSource, InvalidSourceConfig } from "@/lib/sources";
import { matchTracks } from "@/lib/matching/match";

export const maxDuration = 60;

const bodySchema = z.object({
  sourceId: z.string(),
  config: z.record(z.string(), z.unknown()),
});

/**
 * POST /api/convert/search
 *
 * Fetches from the chosen source, then matches every track against Spotify.
 * This is the expensive step and the one the user waits on — but it costs
 * nothing, by design. Only successful playlist writes are ever chargeable.
 */
export async function POST(request: Request) {
  try {
    await requireUser();

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const { tracks, rejected } = await runSource(
      parsed.data.sourceId,
      parsed.data.config,
    );

    if (tracks.length === 0) {
      return NextResponse.json({ results: [], rejected, total: 0 });
    }

    const spotify = spotifyForCurrentUser();
    const results = await matchTracks(tracks, (query, limit) =>
      spotify.searchTracks(query, limit),
    );

    // Trim to what the review UI actually renders. Sending whole Spotify track
    // objects for every alternate would balloon the payload on a 500-track list.
    return NextResponse.json({
      total: results.length,
      rejected,
      results: results.map((result, index) => ({
        index,
        raw: result.query.raw,
        parsedArtist: result.query.artist,
        parsedTitle: result.query.title,
        confidence: result.confidence,
        bucket: result.bucket,
        accepted: result.accepted,
        best: result.best ? summarize(result.best.track) : null,
        alternates: result.alternates.map((alt) => summarize(alt.track)),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function summarize(track: {
  uri: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { name: string; images: Array<{ url: string }> };
  duration_ms: number;
}) {
  return {
    uri: track.uri,
    name: track.name,
    artists: track.artists.map((a) => a.name).join(", "),
    album: track.album?.name ?? "",
    image: track.album?.images?.at(-1)?.url ?? null,
    durationMs: track.duration_ms,
  };
}

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof SpotifyError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof InvalidSourceConfig) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof Error) {
    // Source adapters throw plain Errors with user-facing messages.
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("Unexpected error in /api/convert/search", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
