# PRD — Playlist Converter

**Status:** approved, pre-implementation
**Last updated:** 2026-08-05
**Related docs:** [`SPOTLISTR-CLONE-SPEC.md`](./SPOTLISTR-CLONE-SPEC.md) (research on the
product this is modeled on), [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md)
(architecture and build phases)

---

## 1. Problem

Music discovery happens everywhere except inside Spotify — a YouTube mix, a Reddit
thread, a festival lineup, a screenshot of a friend's recommendations, a Last.fm chart.

Moving 40 songs from any of those into Spotify means 40 manual searches. It's not hard,
it's just boring enough that people don't do it. The songs stay unheard and the source
list gets closed and forgotten.

The existing tool in this space (Spotlistr) proves the demand — it has run since 2014 —
but it spreads itself across 13 input sources and 5 side utilities. The opportunity is
to do the core job better rather than broader.

## 2. Solution

Paste, link, or upload a source. We:

1. **Parse** it into `{artist, title}` pairs, tolerating real-world mess.
2. **Search** Spotify for each track.
3. **Score** every match with a visible confidence percentage.
4. **Review** — you see all of it, fix the few we got wrong, and approve.
5. **Create** the playlist, or export as text/CSV.

The review step is the product's spine, not a formality. Automatic playlist converters
that quietly substitute a karaoke cover for the real track are worse than useless,
because the user doesn't find out until they're listening.

## 3. Principles

**Never silently get it wrong.** Every match shows its confidence and its alternates. A
wrong track added quietly is worse than a track we flagged and skipped. When in doubt,
we surface the doubt.

**Charge for outcomes, not attempts.** Searching, previewing, and reviewing are free and
unlimited; only a song successfully added to a playlist has cost. This puts the
match-quality risk on us, where it belongs. No billing ships in v1, but the design
already assumes this — the debit hook sits at the write step and nowhere else.

**Matching quality is the product.** Everything else is CRUD and forms. Accuracy is a
tested, tracked number, not a vibe.

**Narrow and excellent beats broad and adequate.** Three sources that work perfectly
beat thirteen that mostly work. The long tail exists for SEO; SEO can wait until there's
something worth ranking.

## 4. Users

- **The playlist rebuilder** — has a list somewhere else (an old iTunes export, a
  YouTube playlist, a wedding DJ's setlist) and wants it in Spotify once.
- **The forum lurker** — reads music threads and wants the recommendations without 40
  tabs.
- **The archivist** — wants their Spotify playlists out as CSV, for backup or analysis.

All three are one-shot or occasional users, not daily actives. That shapes the model:
prepaid credits rather than a subscription, and no onboarding that assumes retention.

## 5. Scope — v1

### In

| Capability | Detail |
|---|---|
| Sign in | Spotify OAuth (PKCE), via Supabase Auth |
| Source: Textbox | Paste freeform text; tolerant parsing (see §7) |
| Source: YouTube | Public playlist URL → tracks via Data API v3 |
| Source: Spotify | One of your own playlists (for export, dedupe, reordering) |
| Matching | Confidence-scored, with ~5 alternates per track |
| Review UI | Per-track confidence, checkbox, alternate swap, unmatched list |
| Destination: Spotify | Create new playlist, or append to existing |
| Destination: Export | Plain text copy, CSV download |
| History | List of past conversions with their counts |

### Out (deferred, deliberately)

Last.fm (all 5 source variants), Reddit scraping, file upload, the 5 image-generator
tools, Stripe and any paywall, Cloudflare Turnstile, multi-destination (Apple Music,
Tidal, YouTube Music), continuous playlist sync, the MDX articles section, and the
per-route SEO landing pages.

The credit **ledger table** ships in v1 even though billing does not — retrofitting an
append-only ledger into a live system with real balances is genuinely painful, and the
table costs nothing empty.

## 6. User stories

- As a visitor, I can sign in with Spotify and see my playlists.
- As a user, I can paste messy text (`1. Radiohead — Idioteque (Live) [HD]`) and get a
  scored match for each line.
- As a user, I can paste a YouTube playlist URL and get the same.
- As a user, I can pick one of my own Spotify playlists as the source.
- As a user, on the review screen I can see confidence per track, deselect any track,
  swap in an alternate candidate, and see plainly which lines we couldn't match at all.
- As a user, I can create a new playlist or append to an existing one.
- As a user, I can export the result as plain text or CSV instead of writing to Spotify.
- As a user, I can see my past conversions.

## 7. Behavioral requirements: parsing

The parser must handle, at minimum:

- Leading track numbers — `1.`, `01 -`, `[3]`, `3)`
- Separators — ` - `, ` – `, ` — `, ` by `, ` | `, tab, ` :: `
- Noise parentheticals — `(Official Video)`, `(Official Music Video)`, `(Lyrics)`,
  `(Audio)`, `[HD]`, `[4K]`, bare years
- `feat.` / `ft.` / `featuring` — signal for artist, noise for title
- **Reversed order** — `Idioteque - Radiohead` is as common as the other way around.
  Resolve by trying both and keeping whichever scores higher against real search results.
- Blank lines, duplicate lines, and lines that are clearly not songs (headers, URLs)

Anything the parser can't resolve goes into a visible "couldn't read these" list. It is
never silently dropped.

## 8. Behavioral requirements: confidence

Confidence is shown as a percentage on every single match. Buckets drive the UI:

| Score | Treatment |
|---|---|
| ≥ 85% | Selected, green |
| 60–85% | Selected, amber, alternates one click away |
| < 60% | **Unselected**, red — user must explicitly opt in |
| no result | Listed separately with the raw input line |

The sub-60% default-off rule is a product decision, not a technical one: the cost of a
missing song is a mild annoyance, the cost of a wrong song is a ruined playlist and lost
trust.

## 9. Success criteria

| Metric | Target |
|---|---|
| Top-1 match accuracy on the 200-item fixture corpus | **≥ 95%** |
| Search time, 50-track paste | **< 15s** |
| Tracks added that the user did not see and approve | **0** |
| Conversions that fail on Spotify rate limits | **0** |

The accuracy number is the project's health metric. It is printed by
`npm run test:matching` and no change that lowers it should land.

## 10. Open questions

1. **Spotify API terms.** Development mode caps at 25 users; going public requires a
   quota-extension review. Spotify's developer policy is unfriendly to services whose
   primary purpose is moving data *out* of Spotify — our CSV export is the exposed
   surface. This needs a real read of their policy before we promote the export feature.
   Resolve before Phase 4.
2. **YouTube quota.** 10,000 units/day default. Sufficient early; needs caching and
   possibly a quota increase if the YouTube source gets popular.
3. **Credit pricing**, if and when billing ships. The reference product uses ~10 credits
   per added song with a 3,000-credit free tier. Not decided here.

## 11. Later phases (not commitments)

- **Toolbox** — Last.fm Grid, Now Playing, Spotify Stats, Playlist Cover Maker. All
  client-side DOM→PNG rendering. These are acquisition, not retention.
- **Monetization** — Stripe Checkout → ledger grant, 12-month expiry, Turnstile on
  write endpoints.
- **Differentiators the reference product lacks** — multi-destination (Apple Music and
  Tidal both have write APIs), LLM-assisted parsing for genuinely unstructured prose,
  and continuous playlist *sync* rather than one-shot conversion. Sync is the only one
  of the three that creates a reason to come back.
