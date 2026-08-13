import { z } from "zod";
import { parseText } from "@/lib/matching/parse";
import type { SourceAdapter } from "./types";

const configSchema = z.object({
  text: z.string().min(1, "Paste at least one line"),
});

type Config = z.infer<typeof configSchema>;

export const textboxSource: SourceAdapter<Config> = {
  id: "textbox",
  label: "Paste a list",
  description: "Song titles and artists, one per line",
  authRequired: "none",
  configSchema,
  input: {
    kind: "textarea",
    label: "Paste your tracklist",
    placeholder:
      "Radiohead - Idioteque\n1. Aphex Twin - Xtal\nBlue Monday by New Order",
    help: "One song per line. Numbering, dashes, and YouTube junk like (Official Video) are all handled.",
  },
  async fetch(config) {
    const { tracks, rejected } = parseText(config.text);
    return { tracks, rejected };
  },
};
