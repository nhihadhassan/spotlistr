import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { StatsTool } from "./stats-tool";

export const metadata: Metadata = {
  title: "Spotify stats image maker",
  description:
    "Turn your Spotify top tracks and artists into a shareable image.",
};

export default async function SpotifyStatsPage() {
  const user = await getUser();

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-6 py-16">
      <header className="mb-10 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Spotify stats</h1>
        <p className="text-muted-foreground text-pretty">
          Your top tracks and artists, as an image worth posting.
        </p>
      </header>

      {user ? (
        <StatsTool />
      ) : (
        <Link
          href="/auth/signin?next=/create/spotify-stats"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Connect Spotify
        </Link>
      )}
    </main>
  );
}
