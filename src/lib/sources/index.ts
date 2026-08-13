import { textboxSource } from "./textbox";
import { youtubeSource } from "./youtube";
import { spotifyPlaylistSource } from "./spotify-playlist";
import type { SourceAdapter, SourceResult } from "./types";

/** Every registered source. Adding one here is the only wiring step needed. */
const SOURCES = [
  textboxSource,
  youtubeSource,
  spotifyPlaylistSource,
] as const;

export type SourceId = (typeof SOURCES)[number]["id"];

export class InvalidSourceConfig extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSourceConfig";
  }
}

/**
 * Validates raw config against the source's schema and runs its fetch.
 *
 * Validation and dispatch are deliberately fused: each adapter's `fetch` is
 * typed to its own config, so erasing that type at the registry boundary
 * requires one cast. Doing it here — immediately after `safeParse` has proven
 * the shape — keeps the cast honest and confined to a single line, instead of
 * spreading `any` through the registry type.
 */
export async function runSource(
  id: string,
  rawConfig: unknown,
): Promise<SourceResult> {
  const source: SourceAdapter<unknown> | undefined = SOURCES.find(
    (candidate) => candidate.id === id,
  ) as SourceAdapter<unknown> | undefined;

  if (!source) {
    throw new InvalidSourceConfig(`Unknown source: ${id}`);
  }

  const parsed = source.configSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new InvalidSourceConfig(
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  return source.fetch(parsed.data);
}

/** Serializable descriptors for the client — schemas and fetch don't cross. */
export const SOURCE_DESCRIPTORS = SOURCES.map((source) => ({
  id: source.id,
  label: source.label,
  description: source.description,
  authRequired: source.authRequired,
  input: source.input,
}));

export type SourceDescriptor = (typeof SOURCE_DESCRIPTORS)[number];

export type { SourceAdapter, SourceResult } from "./types";
