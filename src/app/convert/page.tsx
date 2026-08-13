import Link from "next/link";
import { getUser } from "@/lib/auth";
import { spotifyForCurrentUser } from "@/lib/spotify/client";

/**
 * Placeholder for the Phase 3 wizard. For now it doubles as the end-to-end
 * check that the Spotify connection actually works: if your playlists show up
 * here, auth, token storage, refresh, and the API client are all correct.
 */
export default async function ConvertPage() {
  const user = await getUser();

  if (!user) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Connect Spotify to get started
          </h1>
          <p className="text-muted-foreground text-pretty">
            We need permission to read and create playlists on your account.
            Nothing is created without you approving it first.
          </p>
        </div>
        <div>
          <Link
            href="/auth/signin"
            className="inline-flex h-11 items-center rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Connect Spotify
          </Link>
        </div>
      </main>
    );
  }

  let playlists: Array<{ id: string; name: string; total: number }> = [];
  let error: string | null = null;

  try {
    const spotify = spotifyForCurrentUser();
    const raw = await spotify.myPlaylists();
    playlists = raw.map((p) => ({
      id: p.id,
      name: p.name,
      total: p.tracks.total,
    }));
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-6 py-16">
      <div className="mb-10 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Signed in as {user.displayName ?? user.id}
          </h1>
          <p className="mt-2 text-muted-foreground">
            The conversion wizard lands here in Phase 3. Your playlists below
            confirm the Spotify connection is working.
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="h-9 shrink-0 rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            Sign out
          </button>
        </form>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-medium text-destructive">
            Couldn&apos;t load your playlists
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {playlists.map((playlist) => (
            <li
              key={playlist.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <span className="truncate">{playlist.name}</span>
              <span className="shrink-0 text-sm text-muted-foreground">
                {playlist.total} {playlist.total === 1 ? "track" : "tracks"}
              </span>
            </li>
          ))}
          {playlists.length === 0 && (
            <li className="px-4 py-3 text-muted-foreground">
              No playlists on this account yet.
            </li>
          )}
        </ul>
      )}
    </main>
  );
}
