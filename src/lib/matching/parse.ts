import { stripVersionNoise } from "./normalize";

export type ParsedTrack = {
  artist: string;
  title: string;
  /** The original line, shown in the review UI so users can see what we read. */
  raw: string;
  /**
   * True when we couldn't tell artist from title with confidence. The matcher
   * tries both orderings and keeps whichever scores higher.
   */
  ambiguousOrder: boolean;

  /**
   * Optional metadata from structured sources (Spotify, YouTube, Last.fm).
   * Freeform text never has these, but when present they lift matching from
   * good to excellent — ISRC in particular is an exact recording identifier.
   * Source adapters should always populate what they can.
   */
  album?: string;
  durationMs?: number;
  isrc?: string;
};

export type ParseResult = {
  tracks: ParsedTrack[];
  /** Lines we could not read at all. Surfaced to the user, never dropped silently. */
  rejected: string[];
};

/** Separators, in priority order. Order matters: " - " before " | ". */
const SEPARATORS = [
  " - ",
  " – ",
  " — ",
  " -- ",
  " :: ",
  " | ",
  "\t",
  " by ",
  " ~ ",
  " • ",
];

/** Leading list markers: "1.", "[3]", "3)", "- " */
const LEADING_MARKER = /^\s*(?:[-*•]|\[?\d{1,3}[\]).:]?)\s+/;

/** A dash-style marker only. Used for the second pass — see stripLeadingMarker. */
const LEADING_DASH = /^\s*[-*•–—]\s+/;

/**
 * Strips list markers from the front of a line.
 *
 * Two passes, because "01 - Radiohead - Idioteque" carries both a number and a
 * dash. The second pass deliberately only removes dashes: running the full
 * marker pattern twice would turn "1. 2 Unlimited - No Limit" into
 * "Unlimited - No Limit" by eating the band's name.
 */
function stripLeadingMarker(line: string): string {
  const once = line.replace(LEADING_MARKER, "").trim();
  return once.replace(LEADING_DASH, "").trim();
}

/** Lines that are structurally not songs. */
const NOT_A_SONG = [
  /^https?:\/\//i,
  /^\s*$/,
  /^[-=_*#~]{3,}$/, // divider lines
  /^\s*(tracklist|track list|setlist|playlist|songs?|album)\s*:?\s*$/i,
  /^\s*\d+\s*$/, // a bare number
];

/** feat. blocks: signal for artist, noise for title. */
const FEAT = /\s*[([]?\s*\b(feat\.?|ft\.?|featuring|w\/)\s+([^)\]]+)[)\]]?\s*/i;

function looksLikeNoise(line: string): boolean {
  return NOT_A_SONG.some((re) => re.test(line));
}

/**
 * Splits on the first separator found, preferring earlier entries in
 * SEPARATORS. Returns null when no separator is present.
 */
function split(line: string): [string, string] | null {
  for (const sep of SEPARATORS) {
    const idx = line.indexOf(sep);
    // Require content on both sides. A leading " - " is a list marker, not a
    // separator, and is stripped before we get here.
    if (idx > 0 && idx + sep.length < line.length) {
      return [
        line.slice(0, idx).trim(),
        line.slice(idx + sep.length).trim(),
      ];
    }
  }
  return null;
}

/**
 * Heuristics for which side is the artist.
 *
 * Real-world lists come in both orders — "Radiohead - Idioteque" and
 * "Idioteque - Radiohead" are both common — and there is no reliable
 * text-only signal. When we can't tell, we flag `ambiguousOrder` and let the
 * matcher settle it against actual search results, which is the only source
 * of truth available.
 */
function guessOrder(
  left: string,
  right: string,
): { artist: string; title: string; ambiguous: boolean } {
  // A "feat." on one side marks it as the artist field.
  const leftFeat = FEAT.test(left);
  const rightFeat = FEAT.test(right);
  if (leftFeat && !rightFeat)
    return { artist: left, title: right, ambiguous: false };
  if (rightFeat && !leftFeat)
    return { artist: right, title: left, ambiguous: false };

  // A trailing quote or bracket on one side usually marks a title.
  const rightQuoted = /^["'"].*["'"]$/.test(right);
  const leftQuoted = /^["'"].*["'"]$/.test(left);
  if (leftQuoted && !rightQuoted)
    return { artist: right, title: left, ambiguous: false };
  if (rightQuoted && !leftQuoted)
    return { artist: left, title: right, ambiguous: false };

  // Default to "Artist - Title", the more common convention, but flag it.
  return { artist: left, title: right, ambiguous: true };
}

/** Parses one line. Returns null when the line isn't a song. */
export function parseLine(rawLine: string): ParsedTrack | null {
  const raw = rawLine.trim();
  if (looksLikeNoise(raw)) return null;

  const withoutMarker = stripLeadingMarker(raw);
  if (!withoutMarker || looksLikeNoise(withoutMarker)) return null;

  const cleaned = stripVersionNoise(withoutMarker);
  const parts = split(cleaned);

  if (!parts) {
    // No separator. Could still be a searchable title — treat the whole line as
    // the title with an empty artist rather than discarding it. The matcher
    // handles empty artists by weighting title similarity fully.
    if (cleaned.length < 2) return null;
    return { artist: "", title: cleaned, raw, ambiguousOrder: false };
  }

  const [left, right] = parts;
  if (!left || !right) return null;

  const { artist, title, ambiguous } = guessOrder(left, right);

  return {
    artist: cleanField(artist),
    title: cleanField(title),
    raw,
    ambiguousOrder: ambiguous,
  };
}

function cleanField(value: string): string {
  return value
    .replace(/^["'"]|["'"]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses a block of freeform text. Deduplicates identical lines while
 * preserving order.
 */
export function parseText(text: string): ParseResult {
  const tracks: ParsedTrack[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = parseLine(trimmed);
    if (!parsed) {
      // Blank and obvious divider lines aren't worth reporting as failures.
      if (!looksLikeNoise(trimmed)) rejected.push(trimmed);
      continue;
    }

    const key = `${parsed.artist.toLowerCase()}|${parsed.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    tracks.push(parsed);
  }

  return { tracks, rejected };
}

/** Splits "Artist feat. Other" into its parts. Used when building queries. */
export function splitFeaturedArtists(artist: string): {
  primary: string;
  featured: string[];
} {
  const match = artist.match(FEAT);
  if (!match) return { primary: artist.trim(), featured: [] };

  const primary = artist.slice(0, match.index).trim();
  const featured = match[2]
    .split(/,|&| and /i)
    .map((s) => s.trim())
    .filter(Boolean);

  return { primary: primary || artist.trim(), featured };
}
