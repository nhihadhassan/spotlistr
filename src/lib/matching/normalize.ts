/**
 * String normalization and similarity. Pure, no I/O — everything here is
 * directly unit-testable and must stay that way.
 */

/** Suffixes Spotify appends that carry no identity information. */
const VERSION_SUFFIX =
  /\s*[-–—]\s*(\d{4}\s+)?(remaster(ed)?|remastered version|single version|album version|radio edit|mono|stereo|deluxe|expanded|bonus track|anniversary edition|re-?recorded)(\s+\d{4})?\s*$/i;

/** Bracketed noise that appears in YouTube titles and user pastes. */
const NOISE_BRACKETS =
  /[([]\s*(official\s*(music\s*)?(video|audio|lyric video)?|music video|lyrics?|lyric video|audio|hd|hq|4k|full album|visualizer|out now|explicit|clean|free download|download|with lyrics|sub español|legendado)\s*[)\]]/gi;

/** A bare year in brackets: (1997), [2011] */
const BRACKETED_YEAR = /[([]\s*(19|20)\d{2}\s*[)\]]/g;

/** Variant markers that change what the recording *is*. */
export const VARIANT_PATTERNS = {
  live: /\b(live|en vivo|unplugged|concert|session)\b/i,
  remix: /\b(remix|rmx|bootleg|edit by|flip|vip mix|mashup)\b/i,
  karaoke: /\b(karaoke|instrumental version|backing track|sing[- ]?along|made popular by|in the style of|tribute)\b/i,
  cover: /\b(cover|covered by|performed by)\b/i,
  instrumental: /\b(instrumental)\b/i,
  acoustic: /\b(acoustic|stripped)\b/i,
  sped: /\b(sped up|slowed|nightcore|reverb)\b/i,
} as const;

export type Variant = keyof typeof VARIANT_PATTERNS;

/**
 * Aggressive normalization for comparison only. Never show the result to a user.
 * Lowercases, strips diacritics, drops punctuation, collapses whitespace.
 */
export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining marks
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[''`´]/g, "") // apostrophes vanish rather than becoming spaces
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Removes "- Remastered 2011" style suffixes and bracketed noise. */
export function stripVersionNoise(input: string): string {
  return input
    .replace(NOISE_BRACKETS, " ")
    .replace(BRACKETED_YEAR, " ")
    .replace(VERSION_SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strips every parenthetical, not just known-noise ones. Last-resort fallback. */
export function stripAllBrackets(input: string): string {
  return input
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Which recording-variant markers appear in a string. */
export function detectVariants(input: string): Set<Variant> {
  const found = new Set<Variant>();
  for (const [name, pattern] of Object.entries(VARIANT_PATTERNS)) {
    if (pattern.test(input)) found.add(name as Variant);
  }
  return found;
}

/**
 * True when a string is mostly non-Latin (CJK, Cyrillic, Arabic, Hebrew...).
 *
 * This matters because Dice similarity works on character bigrams, which are
 * meaningless for logographic scripts — two completely different Chinese titles
 * of the same length can score high, and two spellings of the same title can
 * score near zero. For these we fall back to exact normalized equality.
 */
export function isNonLatin(input: string): boolean {
  const letters = input.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  const nonLatin = letters.filter((c) => !/\p{Script=Latin}/u.test(c));
  return nonLatin.length / letters.length > 0.4;
}

/**
 * Sørensen–Dice coefficient over character bigrams.
 *
 * Implemented here rather than pulled from a package: the reference product
 * uses the `string-similarity` npm package, which is unmaintained, and we need
 * control over the short-string and non-Latin edge cases anyway.
 */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (a.length + b.length - 2);
}

/**
 * Similarity between two already-normalized strings, with a non-Latin fallback.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (isNonLatin(a) || isNonLatin(b)) {
    // Bigrams lie here. Accept only containment or exact equality.
    if (a.includes(b) || b.includes(a)) return 0.9;
    return 0;
  }
  return dice(a, b);
}
