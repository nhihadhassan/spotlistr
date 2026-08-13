import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { spotifyForCurrentUser, SpotifyError } from "@/lib/spotify/client";

/** GET /api/spotify/search?q= — track search for the Now Playing picker. */
export async function GET(request: Request) {
  try {
    await requireUser();
    const q = new URL(request.url).searchParams.get("q")?.trim();

    if (!q) return NextResponse.json({ tracks: [] });

    const spotify = spotifyForCurrentUser();
    const tracks = await spotify.searchTracks(q, 8);

    return NextResponse.json({
      tracks: tracks.map((track) => ({
        uri: track.uri,
        name: track.name,
        artists: track.artists.map((a) => a.name).join(", "),
        album: track.album?.name ?? "",
        image: track.album?.images?.[0]?.url ?? null,
        durationMs: track.duration_ms,
      })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof SpotifyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected error in /api/spotify/search", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
