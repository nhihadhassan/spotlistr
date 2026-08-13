# Spotlistr — Reverse-Engineered Product Spec & Rebuild Plan

Source: https://www.spotlistr.com (observed 2026-08-05). Everything below is derived from
the public site — its pages, its published OSS-license manifest, and its privacy policy.
No private code was inspected; internal API shapes are my inference, marked as such.

---

## 1. What the product is

A **playlist converter and music-graphics toolbox**. The core job: take a list of songs
that exists *somewhere else* (a YouTube playlist, a Last.fm chart, a Reddit thread, a
text file) and turn it into a real Spotify playlist, with a human-review step for
ambiguous track matches.

Around that core sit five "toolbox" utilities that generate shareable images from music
data. Those are the top-of-funnel — free, viral, no credits — and the converter is what
monetizes.

Business model: **prepaid credits, no subscription.** Company is "Spotlistr, LLC",
site footer says 2014–2026, so this is a decade-old product that has been rewritten.

---

## 2. Feature inventory

### 2.1 Converter (`/search`, route picker at `/convert`)

A 4-step wizard: **Input → Output → Search → Create**.

**Step 1 — Input.** 13 sources:

| Source | What it pulls | API needed |
|---|---|---|
| Spotify | tracks from one of your playlists | Spotify Web API |
| My Spotify Top Tracks | your personal top tracks | Spotify `/me/top/tracks` |
| YouTube | tracks from a YouTube playlist | YouTube Data API v3 |
| Textbox | pasted "Artist – Title" lines | none (parser) |
| File Scraper | uploaded file, tracks scraped out | none (parser) |
| Artist Top Tracks | search an artist, take their top tracks | Spotify |
| Last.fm Artist Top Tracks | `artist.getTopTracks` | Last.fm API |
| Last.fm Similar Tracks | `track.getSimilar` | Last.fm API |
| Last.fm Tag Top Tracks | `tag.getTopTracks` | Last.fm API |
| Last.fm User Loved Tracks | `user.getLovedTracks` | Last.fm API |
| Last.fm User Top Tracks | `user.getTopTracks` + time period | Last.fm API |
| Subreddit | scrapes music links/titles from a subreddit | Reddit API |
| Reddit Comment Thread | scrapes a comment thread | Reddit API |

**Step 2 — Output.** In practice two destinations:
- **Spotify** — create a new playlist or append to an existing one.
- **Export** — plain text copy or CSV download (`spotify-to-export` route).

Observed route slugs in the page payload: `spotify-to-spotify`, `spotify-to-export`,
`youtube-to-spotify`, `textbox-to-spotify`, `reddit-to-spotify`,
`reddit-comments-to-spotify`, plus the Last.fm variants — **13 routes total**, each with
its own SEO landing page. That's deliberate: every route is an indexable page targeting
"convert X to Spotify playlist" queries.

**Step 3 — Search.** Each parsed track is searched against Spotify and scored with a
**confidence percentage**. This is the technical heart of the app (see §4).

**Step 4 — Create.** User reviews matches, deselects bad ones, optionally picks an
alternate candidate per track, then writes the playlist. **Credits are only consumed
here — on songs successfully added.**

### 2.2 Toolbox

| Tool | URL | Inputs | Output |
|---|---|---|---|
| Spotify Stats | `/create/spotify-stats` | Spotify auth, content selection, time range (short/medium/long), appearance | shareable stats image (top tracks/artists) |
| Playlist Covers | `/create/cover` | text layers, font/size/align, text+bg color, letter spacing, line height, padding, corner radius, shadow (off/soft/strong), auto-fit | PNG download **or direct upload to Spotify** |
| Now Playing | `/create/now-playing` | track search, content toggles, pre-built design templates | shareable image with album art |
| Last.fm Grid | `/create/last-fm-grid` | Last.fm username, time period, grid size up to 10×10 | album-art collage image, **+ convert to Spotify playlist** |
| Scrobble Manager | `/manage/last-fm/scrobbles` | Last.fm auth | reviews recent scrobbles, flags likely duplicates (write-capable: needs Last.fm session key) |

Note the cover tool advertises size presets for Spotify, Apple Music, SoundCloud, Qobuz,
Tidal, Amazon Prime Music, YouTube Music, Deezer, and Tencent — but that's just canvas
dimensions, not integrations.

### 2.3 Supporting pages
`/pricing`, `/articles` (MDX blog), `/oss-licenses` (auto-generated), `/privacy-policy`,
cookie consent banner, feedback link.

---

## 3. Confirmed tech stack

The `/oss-licenses` page publishes their full dependency list. Reading it:

**Framework:** Next.js (App Router — RSC flight payloads are visible in the HTML),
React, `@next/mdx` + `@mdx-js/*` for the articles section, `next-themes` for dark mode,
`next-images`.

**UI:** Tailwind CSS + `tailwindcss-animate` + `tailwind-merge` + `clsx` +
`class-variance-authority` + the full Radix UI primitive set + `lucide-react` +
`simple-icons` + `cmdk` + `sonner` (toasts) — i.e. **shadcn/ui**, essentially verbatim.
Plus `framer-motion`/`motion`, `react-confetti`, `react-circular-progressbar`,
`react-day-picker`.

**State:** Redux Toolkit + react-redux + reselect. (A wizard with a long-lived,
multi-step, undo-able track list is one of the few places Redux still earns its keep.)

**Forms:** react-hook-form + zod + `@hookform/resolvers`.

**Image generation:** `dom-to-image-more` (+ a legacy fork for Safari) — all five
graphics tools render **DOM → PNG in the browser**, not server-side. `colorthief`
extracts palettes from album art. `react-moveable` + `react-sizeme` power the drag/resize
layer editing in the cover maker. `file-saver` for downloads.

**Matching:** `string-similarity` — this is the confidence score. See §4.

**Data/infra:** `@supabase/supabase-js` (Postgres + auth), `axios` + `ky` (HTTP),
`p-queue` (rate-limit-aware concurrency against Spotify/Last.fm), `papaparse` (CSV
in/out), `url-parse`, `uuid`, `date-fns`, `lodash-es`, `dompurify` (sanitizing scraped
Reddit/user text).

**Services (from the privacy policy):**
- **Fly.io** — hosting
- **Supabase** — Postgres + auth
- **Stripe** — payments
- **Amplitude** — analytics
- **Cloudflare Turnstile** (`@marsidev/react-turnstile`) — bot protection on the
  credit-spending and scraping endpoints
- **Google AI** — "prompts and related request data"; some feature (likely fuzzy track
  parsing from messy text, or cover-art ideas) calls Gemini
- Connected platforms: Spotify, Apple Music, YouTube, SoundCloud, Last.fm, Reddit

---

## 4. The hard part: track matching

This is where a clone lives or dies. The rest is CRUD and canvas work.

**Pipeline:**

1. **Parse** the source into `{ artist, title, album?, durationMs?, isrc? }`.
   - Structured sources (Spotify, Last.fm, YouTube API) give you clean fields.
   - Unstructured sources (textbox, files, Reddit, YouTube *titles*) need heuristics:
     split on ` - `, `–`, `—`, `by`, ` | `; strip `(Official Video)`, `[HD]`,
     `(Lyrics)`, `ft.`/`feat.` blocks, bracketed years, track numbers, emoji.
2. **Query Spotify Search.** Best results come from field-qualified queries:
   `track:"Blue Monday" artist:"New Order"`, with a bare-string fallback when that
   returns nothing.
3. **Score each candidate** — this is `string-similarity` (Dice coefficient on bigrams),
   run on normalized strings. Normalize before comparing: lowercase, strip diacritics,
   strip punctuation, drop parenthetical suffixes like `- Remastered 2011`.
   A workable composite: `0.6 × titleSim + 0.4 × artistSim`, then bonuses for duration
   within ±3s and exact-ISRC, penalties for live/remix/karaoke mismatch. Surface the
   result as the **confidence %**.
4. **Bucket** by score: auto-accept high, pre-select-but-flag medium, unchecked low,
   and offer the top ~5 candidates as alternates the user can swap in.
5. **Write** in batches of 100 URIs to `POST /v1/playlists/{id}/tracks`, through the
   `p-queue` limiter, with 429 `Retry-After` handling.

Gotchas worth knowing up front: Spotify search is regionally inconsistent (pass
`market=from_token`); the same song exists as single/album/deluxe/remaster duplicates;
karaoke and tribute-band uploads score deceptively high on title; and non-Latin scripts
break bigram similarity badly.

---

## 5. Monetization

**Credits, prepaid, no subscription.**

| Package | Price | Credits | ≈ songs | Effective |
|---|---|---|---|---|
| Starter (free) | $0 | 3,000 | ~300 | — |
| Small | $5 | 20,000 | ~2,000 | 1.0× |
| Standard | $15 | 75,000 | ~7,500 | 1.25× (15,000 bonus) |
| Power | $50 | 300,000 | ~30,000 | 1.5× (100,000 bonus) |

- **~10 credits per song added.**
- Charged **only on successful adds** — searching, previewing, and every toolbox
  generator are free. This is a good design: the user never pays for a failed match, so
  the matching quality risk sits with the vendor, not the customer.
- Credits expire **12 months** after being added.
- Stripe one-time payments, not subscriptions.

---

## 6. Rebuild plan

### 6.1 Data model (Supabase/Postgres)

```
users              -- from Supabase auth
credit_ledger      -- id, user_id, delta, reason, expires_at, created_at
                   --   (append-only ledger; balance = SUM(delta) WHERE not expired.
                   --    Never store a mutable balance column.)
connections        -- user_id, provider(spotify|lastfm|youtube|reddit),
                   --   access_token, refresh_token, expires_at, scopes  [encrypted]
conversions        -- id, user_id, source_type, dest_type, status, counts, created_at
conversion_tracks  -- conversion_id, raw_input, matched_uri, confidence, accepted
purchases          -- stripe_payment_intent, amount, credits_granted
```

### 6.2 Third-party setup you must do first

1. **Spotify Developer app** — scopes: `playlist-modify-public`,
   `playlist-modify-private`, `playlist-read-private`, `user-top-read`,
   `ugc-image-upload` (for cover upload). Use **PKCE** for the browser flow.
   ⚠️ Spotify now requires a quota-extension request for apps serving >25 users; plan
   for the review, and note their policy against services whose main purpose is
   exporting Spotify data elsewhere.
2. **Last.fm API key** (+ session key flow for the Scrobble Manager's writes).
3. **YouTube Data API v3** key — playlist reads are cheap, but the daily quota is real.
4. **Reddit app** (script/OAuth) — their API terms tightened in 2023; check limits.
5. **Stripe** — Checkout + webhook to grant credits.
6. **Cloudflare Turnstile** — gate the scraping and write endpoints.

### 6.3 Build order (my recommendation)

**Phase 1 — the spine.** Next.js App Router + shadcn/ui + Supabase auth. Spotify OAuth.
The single route `textbox-to-spotify`: paste text → parse → match → review → create.
This one route contains the entire hard problem; everything else is variations of the
input adapter.

**Phase 2 — matching quality.** Build a fixture set of ~200 messy real-world inputs with
known-correct Spotify URIs, and treat match accuracy as a tested metric. Don't skip this
— it's the only defensible moat in the product.

**Phase 3 — more sources.** Define a `SourceAdapter` interface
(`{ id, authRequired, configSchema (zod), fetch(): Promise<RawTrack[]> }`) and add
YouTube, Last.fm (5 variants), file, Reddit behind it. Each gets a static SEO landing
page from a shared template — that's their whole acquisition strategy and it's cheap to
copy.

**Phase 4 — credits + Stripe.** Ledger, Turnstile, Stripe Checkout, webhook grant,
expiry job.

**Phase 5 — toolbox.** Last.fm Grid first (no auth, most viral, highest
effort:reward ratio), then Now Playing, Cover Maker, Spotify Stats. All client-side
`dom-to-image-more`. Scrobble Manager last — it needs Last.fm write auth and is the
narrowest-appeal tool.

### 6.4 Things that will bite you

- **Spotify rate limits** are rolling-window and undocumented; `p-queue` with
  concurrency ~4 and 429 backoff is the fix (that's exactly why they ship `p-queue`).
- **Token refresh** must be server-side; never expose refresh tokens to the browser.
- **`dom-to-image` in Safari** silently mis-renders — they ship two forks of it for
  precisely this reason. Budget time here.
- **Album art CORS** — you must proxy Spotify/Last.fm images through your own origin or
  the canvas is tainted and export fails.
- **Credit races** — do the debit in the same Postgres transaction as the playlist-write
  record, or a double-submit gives away songs.

### 6.5 A shortcut worth considering

The 13 sources are mostly padding; ~80% of real usage is almost certainly
text/YouTube/Spotify. Shipping 3 sources with *excellent* matching beats 13 with
mediocre matching. Their long tail exists for SEO, not for users — add it once you care
about organic traffic, not before.

---

## 7. Where a clone could actually be better

- **Multi-destination.** They're Spotify-only in practice. Apple Music (MusicKit),
  Tidal, and YouTube Music all have write APIs. "Any → any" is the obvious gap.
- **LLM-assisted parsing.** They already touch Google AI. An LLM handles
  "that song from the Drive soundtrack, the pink one" and messy Reddit prose far better
  than bigram similarity does.
- **Sync, not just convert.** A one-shot conversion is a single transaction; a playlist
  that stays mirrored across services is a recurring reason to come back.
