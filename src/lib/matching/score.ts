import type { SpotifyTrack } from "@/lib/spotify/types";
import type { ParsedTrack } from "./parse";
import {
  detectVariants,
  normalize,
  similarity,
  stripVersionNoise,
  type Variant,
} from "./normalize";

/** Confidence buckets. These drive the review UI — see PRD §8. */
export const CONFIDENCE = {
  HIGH: 0.85,
  MEDIUM: 0.6,
} as const;

export type ConfidenceBucket = "high" | "medium" | "low";

export function bucketOf(score: number): ConfidenceBucket {
  if (score >= CONFIDENCE.HIGH) return "high";
  if (score >= CONFIDENCE.MEDIUM) return "medium";
  return "low";
}

export type ScoreBreakdown = {
  score: number;
  titleSim: number;
  artistSim: number;
  bonuses: string[];
  penalties: string[];
};

/**
 * Variants that materially change the recording. If the query doesn't ask for
 * one and the candidate is one, that's a wrong track, not a near miss.
 *
 * `karaoke` is the important one: karaoke and "in the style of" uploads have
 * near-identical titles to the real song and would otherwise score ~1.0. This
 * is the single most common way a naive matcher ruins a playlist.
 */
const PENALIZED_VARIANTS: Record<Variant, number> = {
  karaoke: 0.45,
  live: 0.3,
  remix: 0.3,
  cover: 0.25,
  instrumental: 0.25,
  sped: 0.2,
  acoustic: 0.15,
};

export type ScoreOptions = {
  /** Swap artist/title before scoring — used to resolve ambiguous line order. */
  swapped?: boolean;
};

export function scoreCandidate(
  query: ParsedTrack,
  candidate: SpotifyTrack,
  opts: ScoreOptions = {},
): ScoreBreakdown {
  const queryTitle = opts.swapped ? query.artist : query.title;
  const queryArtist = opts.swapped ? query.title : query.artist;

  const bonuses: string[] = [];
  const penalties: string[] = [];

  // Compare titles with version noise removed on both sides, so
  // "Karma Police" matches "Karma Police - Remastered 2011" cleanly.
  const nQueryTitle = normalize(stripVersionNoise(queryTitle));
  const nCandTitle = normalize(stripVersionNoise(candidate.name));
  const titleSim = similarity(nQueryTitle, nCandTitle);

  // Artist: compare against every credited artist, take the best. A track
  // credited "Calvin Harris, Dua Lipa" should match a query for either.
  const nQueryArtist = normalize(queryArtist);
  const artistSims = candidate.artists.map((a) =>
    similarity(nQueryArtist, normalize(a.name)),
  );
  const artistSim = artistSims.length ? Math.max(...artistSims) : 0;

  // With no artist to go on, title carries the whole signal. Cap the result:
  // a title-only match is never as trustworthy as a title+artist match.
  let score = queryArtist
    ? 0.6 * titleSim + 0.4 * artistSim
    : Math.min(titleSim, 0.9);

  // --- bonuses -------------------------------------------------------------

  // ISRC is an exact recording identifier. When it matches, nothing else matters.
  if (query.isrc && candidate.external_ids?.isrc) {
    if (query.isrc.toUpperCase() === candidate.external_ids.isrc.toUpperCase()) {
      bonuses.push("isrc");
      return {
        score: 1,
        titleSim,
        artistSim,
        bonuses,
        penalties,
      };
    }
  }

  if (query.durationMs && candidate.duration_ms) {
    const delta = Math.abs(query.durationMs - candidate.duration_ms);
    if (delta <= 3000) {
      score += 0.05;
      bonuses.push("duration");
    } else if (delta > 30_000) {
      // A 30s+ difference usually means a different edit entirely.
      score -= 0.1;
      penalties.push("duration-mismatch");
    }
  }

  // --- penalties -----------------------------------------------------------

  const queryVariants = detectVariants(`${queryTitle} ${queryArtist}`);
  const candVariants = detectVariants(candidate.name);

  for (const variant of candVariants) {
    if (!queryVariants.has(variant)) {
      score -= PENALIZED_VARIANTS[variant];
      penalties.push(variant);
    }
  }

  // The query asked for a live/acoustic version and this candidate isn't one.
  for (const variant of queryVariants) {
    if (!candVariants.has(variant) && variant !== "karaoke") {
      score -= 0.1;
      penalties.push(`missing-${variant}`);
    }
  }

  // The query's artist appears nowhere in the credits. Strong wrong-track signal.
  if (queryArtist && artistSim < 0.3) {
    score -= 0.15;
    penalties.push("artist-absent");
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    titleSim,
    artistSim,
    bonuses,
    penalties,
  };
}

/**
 * Picks the best candidate. Ties (within 0.02) break toward the earlier release
 * — the original single rather than the greatest-hits reissue — then toward
 * higher popularity.
 */
export function rankCandidates(
  query: ParsedTrack,
  candidates: SpotifyTrack[],
  opts: ScoreOptions = {},
): Array<{ track: SpotifyTrack; breakdown: ScoreBreakdown }> {
  return candidates
    .map((track) => ({ track, breakdown: scoreCandidate(query, track, opts) }))
    .sort((a, b) => {
      const diff = b.breakdown.score - a.breakdown.score;
      if (Math.abs(diff) > 0.02) return diff;

      const dateA = a.track.album?.release_date ?? "9999";
      const dateB = b.track.album?.release_date ?? "9999";
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;

      return (b.track.popularity ?? 0) - (a.track.popularity ?? 0);
    });
}
