import type { Metadata } from "next";
import { CoverTool } from "./cover-tool";

export const metadata: Metadata = {
  title: "Playlist cover maker",
  description:
    "Design a custom playlist cover for Spotify, Apple Music, Tidal and more. Free, no sign-in.",
};

export default function CoverPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-6 py-16">
      <header className="mb-10 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Playlist cover maker
        </h1>
        <p className="text-muted-foreground text-pretty">
          A square cover works everywhere — Spotify, Apple Music, Tidal, Deezer.
          No sign-in needed.
        </p>
      </header>

      <CoverTool />
    </main>
  );
}
