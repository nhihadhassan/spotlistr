import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { spotifyForCurrentUser, SpotifyError } from "@/lib/spotify/client";

export const maxDuration = 60;

const bodySchema = z.object({
  uris: z.array(z.string().startsWith("spotify:track:")).min(1),
  playlistName: z.string().trim().min(1).max(100).optional(),
  existingPlaylistId: z.string().optional(),
  isPublic: z.boolean().optional(),
});

/**
 * POST /api/convert/create
 *
 * The only chargeable step in the product (once billing exists) — a credit
 * debit belongs here and nowhere else, in the same transaction as the write.
 */
export async function POST(request: Request) {
  try {
    await requireUser();

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Bad request" },
        { status: 400 },
      );
    }

    const { uris, playlistName, existingPlaylistId, isPublic } = parsed.data;

    if (!playlistName && !existingPlaylistId) {
      return NextResponse.json(
        { error: "Pick a playlist to add to, or name a new one" },
        { status: 400 },
      );
    }

    // Spotify happily stores the same track twice; users almost never want that.
    const unique = [...new Set(uris)];

    const spotify = spotifyForCurrentUser();

    let playlistId = existingPlaylistId;
    let name = playlistName ?? "";

    if (!playlistId) {
      const created = await spotify.createPlaylist(playlistName!, {
        description: "Created with Playlist Converter",
        isPublic: isPublic ?? false,
      });
      playlistId = created.id;
      name = created.name;
    }

    const added = await spotify.addTracks(playlistId, unique);

    return NextResponse.json({
      playlistId,
      playlistName: name,
      added,
      duplicatesSkipped: uris.length - unique.length,
      url: `https://open.spotify.com/playlist/${playlistId}`,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof SpotifyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected error in /api/convert/create", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
