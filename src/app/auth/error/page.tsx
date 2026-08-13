import Link from "next/link";

const REASONS: Record<string, { title: string; detail: string }> = {
  not_configured: {
    title: "Spotify isn't configured yet",
    detail:
      "SPOTIFY_CLIENT_ID is missing. Copy .env.example to .env.local and fill in your Spotify app credentials.",
  },
  access_denied: {
    title: "You cancelled the Spotify sign-in",
    detail: "Nothing was connected. You can try again whenever you like.",
  },
  bad_state: {
    title: "That sign-in link expired",
    detail:
      "Start again from the beginning rather than reusing an old callback URL.",
  },
  missing_code: {
    title: "Spotify didn't send an authorization code",
    detail: "Try signing in again.",
  },
  exchange_failed: {
    title: "Spotify rejected the token exchange",
    detail:
      "Usually this means the redirect URI doesn't exactly match one registered in your Spotify app settings, or the client secret is wrong. Remember Spotify rejects 'localhost' — use http://127.0.0.1:3000.",
  },
  profile_failed: {
    title: "Couldn't read your Spotify profile",
    detail:
      "The token worked but /me failed. If your app is in development mode, check that your account is added under Settings → User Management.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const info = (reason && REASONS[reason]) || {
    title: "Something went wrong signing in",
    detail: reason ? `Spotify reported: ${reason}` : "No further detail.",
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">{info.title}</h1>
        <p className="text-muted-foreground text-pretty">{info.detail}</p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/auth/signin"
          className="inline-flex h-10 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Try again
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-lg border px-5 font-medium transition-colors hover:bg-accent"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
