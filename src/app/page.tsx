import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-24">
      <div className="space-y-4">
        <h1 className="text-5xl font-semibold tracking-tight text-balance">
          Convert anything into a playlist.
        </h1>
        <p className="text-lg text-muted-foreground text-pretty">
          Paste a tracklist from anywhere. We find every song on Spotify, show
          you how confident we are in each match, and let you fix the ones we
          got wrong before anything is created.
        </p>
      </div>

      <div>
        <Link
          href="/convert"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Start converting
        </Link>
      </div>
    </main>
  );
}
