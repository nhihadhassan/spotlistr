import type { SpotifyTrack } from "@/lib/spotify/types";
import type { ParsedTrack } from "./parse";
import { splitFeaturedArtists } from "./parse";
import { stripAllBrackets, stripVersionNoise } from "./normalize";
import {
  bucketOf,
  rankCandidates,
  type ConfidenceBucket,
  type ScoreBreakdown,
} from "./score";

/**
 * The matcher takes its search function as a parameter rather than importing
 * a Spotify client. That's what lets the accuracy test suite run offline
 * against recorded fixtures — and it's why this whole module is pure.
 */
export type SearchFn = (query: string, limit?: number) => Promise<SpotifyTrack[]>;

export type MatchCandidate = {
  track: SpotifyTrack;
  breakdown: ScoreBreakdown;
};

export type MatchResult = {
  query: ParsedTrack;
  /** Best match, or null when nothing was found at all. */
  best: MatchCandidate | null;
  /** Runners-up, for the "swap this" popover. */
  alternates: MatchCandidate[];
  confidence: number;
  bucket: ConfidenceBucket;
  /** Pre-selected in the review UI. Low-confidence matches default to off. */
  accepted: boolean;
};

const MAX_ALTERNATES = 5;

function quote(value: string): string {
  // Spotify's query parser treats a bare quote as a syntax error.
  return value.replace(/"/g, "");
}

/**
 * Query strategies, tried in order until one returns results.
 *
 * Field-qualified first because it's dramatically more precise; the bare
 * string fallback exists because Spotify's field syntax returns nothing at all
 * for slightly-off artist names, and a fuzzy hit we can score beats no hit.
 */
function buildQueries(track: ParsedTrack): string[] {
  const queries: string[] = [];
  const title = stripVersionNoise(track.title);
  const { primary } = splitFeaturedArtists(track.artist);

  if (primary && title) {
    queries.push(`track:"${quote(title)}" artist:"${quote(primary)}"`);
  }

  if (title && track.artist) {
    queries.push(`${title} ${track.artist}`);
  }

  const bare = stripAllBrackets(title);
  if (bare && bare !== title) {
    if (primary) queries.push(`track:"${quote(bare)}" artist:"${quote(primary)}"`);
    queries.push(`${bare} ${primary}`.trim());
  }

  if (!track.artist && title) {
    queries.push(title);
  }

  return [...new Set(queries.filter(Boolean))];
}

/** Matches one parsed track against Spotify. */
export async function matchTrack(
  track: ParsedTrack,
  search: SearchFn,
): Promise<MatchResult> {
  let candidates: SpotifyTrack[] = [];

  for (const query of buildQueries(track)) {
    candidates = await search(query, 10);
    if (candidates.length > 0) break;
  }

  if (candidates.length === 0) {
    return {
      query: track,
      best: null,
      alternates: [],
      confidence: 0,
      bucket: "low",
      accepted: false,
    };
  }

  let ranked = rankCandidates(track, candidates);

  // The line could have been "Title - Artist". Score it both ways against the
  // same candidates and keep whichever reading the real results support. This
  // is the only reliable way to settle order — text heuristics can't.
  if (track.ambiguousOrder && track.artist) {
    const swapped = rankCandidates(track, candidates, { swapped: true });
    if ((swapped[0]?.breakdown.score ?? 0) > (ranked[0]?.breakdown.score ?? 0)) {
      ranked = swapped;
    }
  }

  const best = ranked[0] ?? null;
  const confidence = best?.breakdown.score ?? 0;
  const bucket = bucketOf(confidence);

  return {
    query: track,
    best,
    alternates: ranked.slice(1, MAX_ALTERNATES + 1),
    confidence,
    bucket,
    // Low-confidence matches are NOT pre-selected. A missing song is an
    // annoyance; a wrong song is a ruined playlist. See PRD §8.
    accepted: bucket !== "low",
  };
}

/**
 * Matches a list of tracks. Concurrency is handled inside the Spotify client's
 * queue, so this can fire them all and let the queue meter the actual requests.
 */
export async function matchTracks(
  tracks: ParsedTrack[],
  search: SearchFn,
  onProgress?: (done: number, total: number) => void,
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  let done = 0;

  await Promise.all(
    tracks.map(async (track, index) => {
      results[index] = await matchTrack(track, search);
      onProgress?.(++done, tracks.length);
    }),
  );

  return results;
}
