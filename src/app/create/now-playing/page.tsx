import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { NowPlayingTool } from "./now-playing-tool";

export const metadata: Metadata = {
  title: "Now playing image maker",
  description:
    "Make a shareable now-playing image from any song, with the album art.",
};

export default async function NowPlayingPage() {
  const user = await getUser();

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-6 py-16">
      <header className="mb-10 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Now playing</h1>
        <p className="text-muted-foreground text-pretty">
          Because screenshots never look right.
        </p>
      </header>

      {user ? (
        <NowPlayingTool />
      ) : (
        <Link
          href="/auth/signin?next=/create/now-playing"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Connect Spotify
        </Link>
      )}
    </main>
  );
}
