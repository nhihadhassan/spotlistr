import Link from "next/link";

const TOOLS = [
  {
    href: "/create/last-fm-grid",
    title: "Last.fm grid",
    description: "Your top albums as a collage, up to 10×10",
    signIn: false,
  },
  {
    href: "/create/cover",
    title: "Playlist covers",
    description: "Design a square cover for any service",
    signIn: false,
  },
  {
    href: "/create/spotify-stats",
    title: "Spotify stats",
    description: "Your top tracks and artists, as an image",
    signIn: true,
  },
  {
    href: "/create/now-playing",
    title: "Now playing",
    description: "A shareable card for any song",
    signIn: true,
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <section className="space-y-6">
        <h1 className="text-5xl font-semibold tracking-tight text-balance">
          Convert anything into a playlist.
        </h1>
        <p className="text-lg text-muted-foreground text-pretty">
          Paste a tracklist from anywhere. We find every song on Spotify, show
          you how confident we are in each match, and let you fix the ones we
          got wrong before anything is created.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/convert"
            className="inline-flex h-11 items-center rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start converting
          </Link>
          <a
            href="#toolbox"
            className="inline-flex h-11 items-center rounded-lg border px-6 font-medium transition-colors hover:bg-accent"
          >
            Covers, stats &amp; more
          </a>
        </div>
      </section>

      <section id="toolbox" className="mt-24 space-y-6 scroll-mt-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Toolbox</h2>
          <p className="text-muted-foreground">
            Free tools. The first two don&apos;t even need an account.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="rounded-lg border p-5 transition-colors hover:bg-accent"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{tool.title}</span>
                {!tool.signIn && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    no sign-in
                  </span>
                )}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {tool.description}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
