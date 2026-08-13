import type { Metadata } from "next";
import { GridTool } from "./grid-tool";

export const metadata: Metadata = {
  title: "Last.fm album grid maker",
  description:
    "Turn your Last.fm listening history into a shareable album-art collage, up to 10×10. Free, no sign-in.",
};

export default function LastFmGridPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-6 py-16">
      <header className="mb-10 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Last.fm album grid
        </h1>
        <p className="text-muted-foreground text-pretty">
          Your most-played albums as a collage. No sign-in needed — Last.fm
          profiles are public.
        </p>
      </header>

      <GridTool />
    </main>
  );
}
