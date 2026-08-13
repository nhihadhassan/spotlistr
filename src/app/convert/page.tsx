import Link from "next/link";
import { getUser } from "@/lib/auth";
import { spotifyForCurrentUser } from "@/lib/spotify/client";
import { SOURCE_DESCRIPTORS } from "@/lib/sources";
import { Wizard } from "@/components/wizard/wizard";

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

  // Used by the Spotify source picker and the "add to existing" flow. A
  // failure here shouldn't block the textbox and YouTube sources, which don't
  // need it — so degrade to an empty list rather than erroring the page.
  let playlists: Array<{ id: string; name: string; trackCount: number }> = [];
  try {
    const spotify = spotifyForCurrentUser();
    playlists = (await spotify.myPlaylists()).map((p) => ({
      id: p.id,
      name: p.name,
      trackCount: p.tracks.total,
    }));
  } catch {
    playlists = [];
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-6 py-16">
      <header className="mb-10 flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          Convert to a playlist
        </h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="h-9 shrink-0 rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            Sign out
          </button>
        </form>
      </header>

      <Wizard sources={SOURCE_DESCRIPTORS} playlists={playlists} />
    </main>
  );
}
