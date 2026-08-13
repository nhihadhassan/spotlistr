import type { SpotifyTrack } from "@/lib/spotify/types";
import { normalize } from "../normalize";
import type { SearchFn } from "../match";

/**
 * A small offline stand-in for Spotify's index.
 *
 * The point is to exercise parse -> query -> rank end to end without network
 * access, and — crucially — to include the *decoys* that a real search returns:
 * karaoke uploads, live cuts, remixes, remasters, and same-titled songs by
 * other artists. A matcher that only ever sees the right answer is not tested.
 */

type Seed = {
  id: string;
  name: string;
  artists: string[];
  durationMs?: number;
  releaseDate?: string;
  popularity?: number;
};

const SEEDS: Seed[] = [
  // --- real tracks ---------------------------------------------------------
  { id: "idioteque", name: "Idioteque", artists: ["Radiohead"], releaseDate: "2000-10-02" },
  { id: "karma-police", name: "Karma Police", artists: ["Radiohead"], releaseDate: "1997-06-16" },
  { id: "creep", name: "Creep", artists: ["Radiohead"], releaseDate: "1993-02-22", durationMs: 238_640 },
  { id: "xtal", name: "Xtal", artists: ["Aphex Twin"], releaseDate: "1992-11-09" },
  { id: "halo", name: "Halo", artists: ["Beyoncé"], releaseDate: "2008-11-14" },
  { id: "one-kiss", name: "One Kiss", artists: ["Calvin Harris", "Dua Lipa"], releaseDate: "2018-04-06" },
  { id: "sunflower", name: "Sunflower", artists: ["Post Malone", "Swae Lee"], releaseDate: "2018-10-18" },
  { id: "one-more-time", name: "One More Time", artists: ["Daft Punk"], releaseDate: "2001-03-12" },
  { id: "come-as-you-are", name: "Come As You Are", artists: ["Nirvana"], releaseDate: "1991-09-24" },
  { id: "bohemian-rhapsody", name: "Bohemian Rhapsody", artists: ["Queen"], releaseDate: "1975-10-31" },
  { id: "no-limit", name: "No Limit", artists: ["2 Unlimited"], releaseDate: "1993-01-01" },
  { id: "hikari", name: "光", artists: ["宇多田ヒカル"], releaseDate: "2002-03-20" },
  { id: "smells-like", name: "Smells Like Teen Spirit", artists: ["Nirvana"], releaseDate: "1991-09-10" },
  { id: "paranoid-android", name: "Paranoid Android", artists: ["Radiohead"], releaseDate: "1997-05-26" },
  { id: "blue-monday", name: "Blue Monday", artists: ["New Order"], releaseDate: "1983-03-07" },
  { id: "911", name: "911 / Mr. Lonely", artists: ["Tyler, The Creator"], releaseDate: "2017-07-21" },
  { id: "dont-stop", name: "Don't Stop Believin'", artists: ["Journey"], releaseDate: "1981-10-01" },
  { id: "levitating", name: "Levitating", artists: ["Dua Lipa"], releaseDate: "2020-03-27" },
  { id: "hotline-bling", name: "Hotline Bling", artists: ["Drake"], releaseDate: "2015-07-31" },
  { id: "take-on-me", name: "Take On Me", artists: ["a-ha"], releaseDate: "1985-06-01" },

  // --- decoys: the things that fool naive matchers -------------------------
  { id: "creep-karaoke", name: "Creep (Karaoke Version)", artists: ["Karaoke Universe"], popularity: 20 },
  { id: "creep-style-of", name: "Creep (In the Style of Radiohead)", artists: ["The Tribute Band"], popularity: 15 },
  { id: "creep-live", name: "Creep - Live", artists: ["Radiohead"], popularity: 40 },
  { id: "creep-cover", name: "Creep", artists: ["Postmodern Jukebox"], popularity: 45 },
  { id: "karma-police-remaster", name: "Karma Police - Remastered 2011", artists: ["Radiohead"], releaseDate: "2011-01-01" },
  { id: "come-as-you-are-live", name: "Come As You Are - Live", artists: ["Nirvana"], popularity: 40 },
  { id: "one-more-time-remix", name: "One More Time - Kanye Remix", artists: ["Daft Punk"], popularity: 30 },
  { id: "halo-karaoke", name: "Halo (Karaoke Version)", artists: ["Sing Along Crew"], popularity: 10 },
  { id: "bohemian-karaoke", name: "Bohemian Rhapsody (Karaoke)", artists: ["Karaoke Universe"], popularity: 12 },
  { id: "sunflower-sped", name: "Sunflower - Sped Up", artists: ["Post Malone"], popularity: 35 },
  { id: "levitating-remix", name: "Levitating - DaBaby Remix", artists: ["Dua Lipa", "DaBaby"], popularity: 60 },
  { id: "take-on-me-acoustic", name: "Take On Me - Acoustic", artists: ["a-ha"], popularity: 50 },
  { id: "creep-reissue", name: "Creep", artists: ["Radiohead"], releaseDate: "2015-01-01", popularity: 55 },
  { id: "sakura-nagashi", name: "桜流し", artists: ["宇多田ヒカル"], releaseDate: "2012-11-17" },
  { id: "blue-monday-88", name: "Blue Monday '88", artists: ["New Order"], popularity: 35 },
];

export const CATALOG: SpotifyTrack[] = SEEDS.map((seed) => ({
  id: seed.id,
  uri: `spotify:track:${seed.id}`,
  name: seed.name,
  duration_ms: seed.durationMs ?? 210_000,
  explicit: false,
  popularity: seed.popularity ?? 70,
  album: {
    id: `album-${seed.id}`,
    name: `${seed.name} (Album)`,
    images: [],
    release_date: seed.releaseDate ?? "2000-01-01",
    release_date_precision: "day",
  },
  artists: seed.artists.map((name, i) => ({ id: `artist-${seed.id}-${i}`, name })),
}));

/** Strips Spotify's field-qualifier syntax back down to plain terms. */
function bareTerms(query: string): string {
  return query.replace(/\b(track|artist|album):/g, " ").replace(/"/g, " ");
}

/**
 * A deliberately permissive fake search: any catalog track sharing a token with
 * the query comes back. Being permissive is the point — it forces the *scorer*
 * to do the discriminating work, which is what we actually want to test.
 */
export const fakeSearch: SearchFn = async (query, limit = 10) => {
  const terms = normalize(bareTerms(query)).split(" ").filter((t) => t.length > 1);
  if (terms.length === 0) return [];

  const scored = CATALOG.map((candidate) => {
    const haystack = normalize(
      `${candidate.name} ${candidate.artists.map((a) => a.name).join(" ")}`,
    );
    const hits = terms.filter((t) => haystack.includes(t)).length;
    return { candidate, hits };
  })
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  return scored.slice(0, limit).map((r) => r.candidate);
};
