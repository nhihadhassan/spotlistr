# Playlist Converter

Turn a tracklist from anywhere into a Spotify playlist, with a confidence score
on every match and a review step before anything is created.

**Docs:** [PRD.md](./PRD.md) · [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) ·
[SPOTLISTR-CLONE-SPEC.md](./SPOTLISTR-CLONE-SPEC.md) (research on the reference product)

## Status

| Phase | State |
|---|---|
| 1 — Foundation (Next.js, Spotify auth + API client) | complete; OAuth round-trip needs your credentials to verify |
| 2 — Matching engine | complete, 50 tests passing |
| 3 — Conversion wizard | complete; needs a live Spotify session to exercise |
| 4 — YouTube + Spotify sources, CSV/text export | complete |
| 5 — Toolbox (grid, cover, stats, now playing) | complete |
| 6 — Stripe / credits | schema only, deliberately deferred |

## Setup

```bash
npm install
npm run dev
```

Then open **http://127.0.0.1:3000** — not `localhost:3000`, see below.

Only a Spotify developer app is needed to run this today. Supabase is scaffolded
but switched off; auth currently runs on a signed httpOnly session cookie.

### Spotify app

1. https://developer.spotify.com/dashboard → **Create app**
2. Redirect URI, exactly: `http://127.0.0.1:3000/auth/callback`
3. Check **Web API**, save.
4. Settings → copy the **Client ID** and **Client secret** into `.env.local`.

⚠️ **Spotify rejects `localhost` as a redirect URI** (rule effective April 2025).
You must use the `127.0.0.1` form, and browse to `127.0.0.1:3000` too — Spotify
treats the two origins as different and the callback will fail otherwise.

⚠️ Apps sit in **development mode** until you pass a quota-extension review:
25 users max, each added by hand under **Settings → User Management**. Plan for
that review before any public launch.

`.env.local` is created for you on first setup with a generated `SESSION_SECRET`;
you only need to paste the two Spotify values.

## Commands

```bash
npm run dev            # dev server
npm run build          # production build
npm test               # all tests
npm run test:matching  # accuracy harness — prints top-1 accuracy
npm run typecheck      # tsc --noEmit
```

## Architecture notes worth reading before you change things

**Tokens never reach the browser.** Every Spotify call goes through a Route
Handler. Today tokens live in an httpOnly signed cookie — it passes through the
browser but page JS can never read it. Once Supabase is on they move to the
`connections` table, which has no user-facing RLS select policy on purpose;
provider tokens are read server-side with the service role only. If you find
yourself adding a select policy there, stop.

**Auth is mid-migration and that's deliberate.** `TokenStore`
(`src/lib/spotify/tokens.ts`) has a cookie implementation and a Supabase one.
`SpotifyClient` depends on the interface, so switching is a one-line change at
the call site. `src/lib/session.ts` is the development-stage stand-in — don't
grow features on top of it.

**The credit ledger is append-only.** Balance is `SUM(delta)` over unexpired
rows. There is no balance column and adding one would introduce race conditions
and destroy auditability.

**The matcher is pure.** `src/lib/matching/` takes its search function as a
parameter rather than importing a Spotify client, which is what lets the
accuracy suite run offline. Keep it that way.

**The image proxy's allowlist is load-bearing.** `/api/image-proxy` exists
because a canvas tainted by a cross-origin image fails PNG export silently. Its
host allowlist is what stops it being an open SSRF proxy into the internal
network. Never widen it to a substring match or a user-supplied host.

**Match accuracy is the health metric.** `npm run test:matching` prints top-1
accuracy against `src/lib/matching/__tests__/cases.json`. The gate is 95%. If a
refactor lowers it, the refactor is wrong.

Note that the current corpus runs against a small offline catalog, so it tests
parsing, query construction, ranking, and decoy rejection — not real-world
search recall. Building a live corpus of ~200 real inputs with verified Spotify
URIs is the outstanding task that makes this number meaningful.
