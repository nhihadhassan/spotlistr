# Spotlistr Rebuild — PRD + Implementation Plan

## Context

`~/path/to/spotlistr` was an empty directory. We are building, from
scratch, a product modeled on https://www.spotlistr.com — a tool that converts tracklists
from arbitrary sources into Spotify playlists, with a human review step for ambiguous
matches, surrounded by free image-generator tools that drive acquisition.

Research on the original is already complete and written up in
`SPOTLISTR-CLONE-SPEC.md` (in the project root) — feature inventory, confirmed tech
stack read off their published OSS-license manifest, credit model, and matching-pipeline
analysis. This document is the forward-looking PRD and build plan; the spec file is the
backward-looking research. Both should live in the repo.

**Decisions locked in with the user:**

| Decision | Choice |
|---|---|
| v1 scope | Focused MVP — 3 sources (Textbox, YouTube, Spotify) → Spotify, excellent matching, review UI |
| Monetization | Credit ledger in the schema from day one; **no Stripe, no paywall in v1** |
| Stack | Next.js (App Router) + Supabase + Vercel |
| Toolbox | All three wanted eventually (Last.fm Grid, Cover Maker, Now Playing/Stats) — **Phase 5**, not v1 |

---

# Part 1 — PRD

## 1.1 Problem

Music discovery happens everywhere except inside Spotify: a YouTube mix, a Reddit thread,
a festival lineup, a friend's text message, a Last.fm chart. Getting those 40 songs into
Spotify by hand is 40 searches, and it's boring enough that people just don't. The songs
stay unheard.

## 1.2 Product

Paste, upload, or link a source. We parse it into tracks, search Spotify for each one,
score every match with a visible confidence percentage, and show you a review screen
where you fix the handful we got wrong. One click creates the playlist.

## 1.3 Principles

1. **Never silently get it wrong.** Every match shows its confidence and its alternates.
   A wrong track added quietly is worse than a track we flagged and skipped.
2. **The user pays for outcomes, not attempts.** (Spotlistr charges only on successful
   adds. Even without billing in v1, this shapes the design: search is free and
   unlimited, and the credit debit hook sits at the write step.)
3. **Matching quality is the product.** Everything else is CRUD. Treat accuracy as a
   tested, tracked metric — not a vibe.
4. **Ship a narrow thing that works.** Three sources done excellently beat thirteen done
   adequately. The long tail exists for SEO, and SEO can wait.

## 1.4 v1 user stories

- As a visitor, I can sign in with Spotify and see my playlists.
- As a user, I can paste a block of messy text ("1. Radiohead — Idioteque (Live)") and
  get back a scored match for each line.
- As a user, I can paste a YouTube playlist URL and get the same.
- As a user, I can pick one of my own Spotify playlists as the source (for dedupe,
  reordering, or export).
- As a user, on the review screen I can: see confidence per track, deselect a track,
  swap in one of ~5 alternate candidates, and see which lines failed to parse at all.
- As a user, I can create a new playlist or append to an existing one.
- As a user, I can export any result as plain text or CSV instead.
- As a user, I can see my past conversions.

## 1.5 Explicit non-goals for v1

Last.fm anything, Reddit scraping, file upload, the 5 image tools, Stripe, Turnstile,
multi-destination (Apple Music/Tidal), playlist sync, the MDX articles section, the 13
SEO landing pages.

## 1.6 Success criteria

- **≥95% top-1 match accuracy** on a curated 200-item fixture set of messy real inputs.
- A 50-track paste completes search in **under 15 seconds**.
- Zero cases of a track being added that the user did not see and approve.

---

# Part 2 — Architecture

## 2.1 Stack

- **Next.js 15 App Router**, TypeScript, React Server Components.
- **Tailwind + shadcn/ui** (Radix primitives, `lucide-react`, `sonner` for toasts) —
  the same UI foundation the original uses.
- **Supabase** — Postgres, Auth (Spotify OAuth provider), Row Level Security.
- **Vercel** — hosting; Route Handlers for all third-party API calls.
- **Zustand** for the wizard state, **not Redux.** The original uses Redux Toolkit, but
  that's a legacy artifact of a decade-old codebase; a single wizard store does not
  justify RTK's ceremony. If the state genuinely outgrows Zustand we can revisit.
- **react-hook-form + zod** for forms and for source-config validation.
- **p-queue** for rate-limited concurrency against Spotify.
- **papaparse** for CSV export.

## 2.2 Critical rule: tokens never reach the browser

All Spotify API calls go through our own Route Handlers. Supabase Auth holds the Spotify
`provider_token` / `provider_refresh_token`; a server-side helper refreshes on 401 and
writes back. The client never sees a token. This is the single most important structural
decision in the app — getting it wrong is a credential-leak bug, not a style preference.

## 2.3 Directory layout

```
app/
  (marketing)/page.tsx              landing
  convert/page.tsx                  route picker
  convert/[route]/page.tsx          the 4-step wizard
  api/
    spotify/search/route.ts         batched track search
    spotify/playlists/route.ts      list / create
    spotify/playlists/[id]/tracks/route.ts   batched add
    sources/youtube/route.ts        playlist fetch
    conversions/route.ts            persist + list
lib/
  spotify/client.ts                 authed fetch + refresh + p-queue
  sources/                          one adapter per source (see 2.4)
  matching/
    normalize.ts                    string cleanup
    parse.ts                        freeform text -> RawTrack[]
    score.ts                        the confidence algorithm
    match.ts                        orchestration: query -> candidates -> score
  credits/ledger.ts                 balance + debit (inert in v1)
  supabase/{server,client}.ts
components/wizard/                  Step1Input .. Step4Create, TrackReviewRow
fixtures/matching/                  the accuracy test corpus
```

## 2.4 The SourceAdapter interface

Everything hangs off this. Adding a source later must mean writing one file, nothing
else.

```ts
interface SourceAdapter {
  id: string;                       // 'textbox' | 'youtube' | 'spotify'
  label: string;
  authRequired: 'none' | 'spotify' | 'lastfm';
  configSchema: z.ZodSchema;        // drives the Step-1 form automatically
  fetch(config, ctx): Promise<RawTrack[]>;
}

type RawTrack = {
  title: string; artist: string;
  album?: string; durationMs?: number; isrc?: string;
  raw: string;                      // original line, for the review UI
};
```

`RawTrack.isrc` and `durationMs` are optional but are what lift matching from good to
excellent — always populate them when the source provides them (Spotify and YouTube
both can).

## 2.5 Data model (Supabase, all with RLS on `user_id`)

```sql
-- profiles: mirrors auth.users
-- connections(user_id, provider, access_token, refresh_token, expires_at, scopes)
--   encrypted at rest; provider in ('spotify','lastfm','youtube','reddit')
-- conversions(id, user_id, source_type, dest_type, status,
--             total_parsed, total_matched, total_added, created_at)
-- conversion_tracks(conversion_id, raw_input, matched_uri, confidence,
--                   accepted, position)
-- credit_ledger(id, user_id, delta, reason, expires_at, created_at)
--   APPEND ONLY. balance = SUM(delta) WHERE expires_at > now().
--   Never add a mutable balance column — that's how you get race conditions
--   and an unauditable billing system.
-- purchases(...)  -- table created in v1, unused until Stripe lands
```

---

# Part 3 — The matching engine (the part that matters)

Build this behind a pure, side-effect-free interface so it can be tested offline against
fixtures.

### Step 1 — Parse (`lib/matching/parse.ts`)

Freeform line → `{artist, title}`. Handles, in order:
strip leading track numbers (`1.`, `01 -`, `[3]`); split on the first of ` - `, ` – `,
` — `, ` by `, ` | `, tab, or ` :: `; strip noise parentheticals
(`(Official Video)`, `(Lyrics)`, `[HD]`, `(Audio)`, `(Official Music Video)`, year tags);
detect and preserve `feat.`/`ft.` (it's signal for artist, noise for title);
handle the reversed `Title - Artist` case by checking both orders against search results
and keeping the better-scoring one.

### Step 2 — Query (`lib/matching/match.ts`)

Field-qualified first: `track:"Idioteque" artist:"Radiohead"` with `market=from_token`.
On zero results, fall back to a bare-string query. On still-zero, retry with the title
stripped of all parentheticals. Take the top ~10 candidates.

### Step 3 — Score (`lib/matching/score.ts`)

Normalize both sides first (lowercase, strip diacritics via `NFD`, strip punctuation,
drop `- Remastered 2011` / `- Single Version` suffixes), then:

```
base    = 0.60 * dice(title) + 0.40 * dice(artist)
+0.10   exact ISRC match            -> effectively auto-accept
+0.05   duration within ±3s
-0.30   candidate is live/remix/karaoke/cover/instrumental and query is not
-0.15   query artist appears nowhere in candidate's artist list
```

Use `string-similarity` (Dice coefficient) as the base, matching the original. Clamp to
0–1, present as a percentage.

**Known failure modes to handle explicitly:** karaoke and tribute-band uploads score
near-perfect on title (hence the penalty term); non-Latin scripts break bigram
similarity, so fall back to exact-normalized-equality for CJK/Cyrillic; the same song
exists as single/album/deluxe/remaster, so prefer the earliest release date on ties.

### Step 4 — Bucket

- `≥ 0.85` → auto-selected, shown green
- `0.60 – 0.85` → selected but flagged amber, alternates one click away
- `< 0.60` → unselected, red, user must opt in
- no results → shown in a "couldn't find these" list with the raw line

### Step 5 — Write

Batch 100 URIs per `POST /v1/playlists/{id}/tracks`, through `p-queue`
(concurrency 4), honoring `Retry-After` on 429. Record the debit and the
`conversion_tracks` rows in the **same transaction** as the write record.

### Fixtures

`fixtures/matching/cases.json` — ~200 real messy inputs with known-correct Spotify URIs.
`npm run test:matching` reports top-1 accuracy as a single number. **This number is the
project's health metric.** Do not let a refactor land that moves it down.

---

# Part 4 — Build phases

**Phase 1 — Foundation.** Next.js + TS + Tailwind + shadcn scaffold. Supabase project,
schema migration, RLS. Spotify OAuth via Supabase Auth (PKCE). The server-side Spotify
client with refresh + p-queue. Verify: sign in, hit `/api/spotify/playlists`, see your
real playlists.

**Phase 2 — Matching engine.** `normalize` → `parse` → `score` → `match`, pure and
testable. Build the fixture corpus. Get top-1 accuracy above 95% before touching UI.
This is where the time should go.

**Phase 3 — The wizard.** The 4 steps (Input → Output → Search → Create), Zustand store,
`textbox-to-spotify` end to end. `TrackReviewRow` with confidence pill, checkbox, and
alternates popover. Progress + confetti on completion (the original does this and it's
genuinely good UX for a slow operation).

**Phase 4 — Sources 2 and 3 + export.** `SourceAdapter` for YouTube (Data API v3,
playlistItems) and Spotify (own playlists). Text and CSV export via papaparse. At this
point the v1 product is complete.

**Phase 5 — Toolbox** (post-v1, in this order): Last.fm Grid first — no auth, most
viral, best effort-to-reward. Then Now Playing, Spotify Stats, Cover Maker. All render
client-side with `dom-to-image-more`. Two hard-won gotchas from the original: they ship
*two* forks of `dom-to-image` because Safari mis-renders, and **album art must be proxied
through our own origin** or the canvas is CORS-tainted and export silently fails.

**Phase 6 — Monetization** (only if the product earns it): Stripe Checkout, webhook →
ledger grant, expiry job, Turnstile on write endpoints.

## Third-party setup (needed before Phase 1 completes)

1. **Spotify Developer app** — redirect URI to the Supabase callback; scopes
   `playlist-modify-public`, `playlist-modify-private`, `playlist-read-private`,
   `user-top-read`, and `ugc-image-upload` (Phase 5 only).
   ⚠️ **Development mode caps you at 25 users.** Going public needs a quota-extension
   review, and Spotify's terms are unfriendly to services whose primary purpose is
   moving data *out* of Spotify — our export feature is the exposed surface. Worth
   reading their developer policy before Phase 4.
2. **YouTube Data API v3** key — `playlistItems.list` is 1 quota unit per call against a
   10,000/day default. Fine for a while, but cache.
3. Supabase project + Vercel project.

---

# Part 5 — Verification

- **Matching:** `npm run test:matching` against the fixture corpus; the printed top-1
  accuracy is the gate. Unit tests on `parse.ts` for each noise pattern.
- **Auth/API:** sign in as a real Spotify user, confirm playlists list; force a 401 by
  expiring the token and confirm silent refresh.
- **End to end (manual, per source):** paste a known 30-track list → confirm the
  confidence distribution looks sane → deliberately swap one alternate → create →
  **open the playlist in Spotify and verify track-for-track.**
- **The rate-limit path:** run a 500-track conversion and confirm no 429 failures and no
  duplicate adds.
- **RLS:** query another user's `conversions` row with their id from a different session
  and confirm it returns nothing.

## Deliverables from this plan

1. `PRD.md` in the repo (Part 1 above, expanded).
2. `SPOTLISTR-CLONE-SPEC.md` — already written; the research reference.
3. The Phase 1–4 implementation.
