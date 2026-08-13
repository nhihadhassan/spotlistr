import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { spotifyForCurrentUser, SpotifyError } from "@/lib/spotify/client";

/** GET /api/spotify/playlists — the signed-in user's playlists. */
export async function GET() {
  try {
    await requireUser();
    const spotify = spotifyForCurrentUser();
    const playlists = await spotify.myPlaylists();

    return NextResponse.json({
      playlists: playlists.map((p) => ({
        id: p.id,
        name: p.name,
        trackCount: p.tracks.total,
        image: p.images?.[0]?.url ?? null,
        owner: p.owner.display_name,
        isPublic: p.public,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/spotify/playlists — create a playlist. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      isPublic?: boolean;
    };

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "A playlist name is required" },
        { status: 400 },
      );
    }

    const spotify = spotifyForCurrentUser();
    const playlist = await spotify.createPlaylist(body.name.trim(), {
      description: body.description,
      isPublic: body.isPublic,
    });

    return NextResponse.json({ id: playlist.id, name: playlist.name });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof SpotifyError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("Unexpected error in /api/spotify/playlists", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
