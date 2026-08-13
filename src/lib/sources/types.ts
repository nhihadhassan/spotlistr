import type { z } from "zod";
import type { ParsedTrack } from "@/lib/matching/parse";

/**
 * A place tracks can come from.
 *
 * Adding a source must mean writing one file and registering it — nothing
 * else in the app should need to know the list of sources. The wizard builds
 * its step-1 form from `configSchema`, and the fetch route dispatches on `id`.
 */
export interface SourceAdapter<TConfig = unknown> {
  id: string;
  label: string;
  description: string;
  /** Whether the user must be connected to something before this works. */
  authRequired: "none" | "spotify";
  configSchema: z.ZodType<TConfig>;
  /** The shape of the single input the wizard renders for this source. */
  input: {
    kind: "textarea" | "url" | "playlist-picker";
    label: string;
    placeholder?: string;
    help?: string;
  };
  fetch(config: TConfig): Promise<SourceResult>;
}

export type SourceResult = {
  tracks: ParsedTrack[];
  /** Lines or items we couldn't read. Always surfaced, never dropped silently. */
  rejected: string[];
  /** Optional name to pre-fill the destination playlist with. */
  suggestedName?: string;
};
