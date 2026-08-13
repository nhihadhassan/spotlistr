import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { spotifyForCurrentUser, SpotifyError } from "@/lib/spotify/client";

const querySchema = z.object({
  type: z.enum(["tracks", "artists"]),
  // Spotify's windows: ~4 weeks, ~6 months, ~1 year of history.
  range: z.enum(["short_term", "medium_term", "long_term"]),
  limit: z.coerce.number().int().min(1).max(50),
});

/** GET /api/spotify/top — the signed-in user's top tracks or artists. */
export async function GET(request: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(request.url);

    const parsed = querySchema.safeParse({
      type: searchParams.get("type") ?? "tracks",
      range: searchParams.get("range") ?? "medium_term",
      limit: searchParams.get("limit") ?? "10",
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const { type, range, limit } = parsed.data;
    const spotify = spotifyForCurrentUser();
    const items = await spotify.topItems(type, range, limit);

    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof SpotifyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected error in /api/spotify/top", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
