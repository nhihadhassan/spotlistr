"use client";

import { create } from "zustand";

export type MatchSummary = {
  uri: string;
  name: string;
  artists: string;
  album: string;
  image: string | null;
  durationMs: number;
};

export type MatchRow = {
  index: number;
  raw: string;
  parsedArtist: string;
  parsedTitle: string;
  confidence: number;
  bucket: "high" | "medium" | "low";
  accepted: boolean;
  best: MatchSummary | null;
  alternates: MatchSummary[];
};

export type Step = 1 | 2 | 3 | 4;
export type Destination = "spotify" | "export";

type WizardState = {
  step: Step;
  sourceId: string | null;
  config: Record<string, unknown>;
  destination: Destination;
  results: MatchRow[];
  rejected: string[];
  searching: boolean;
  error: string | null;
  created: { url: string; name: string; added: number } | null;

  setStep: (step: Step) => void;
  setSource: (id: string) => void;
  setConfig: (config: Record<string, unknown>) => void;
  setDestination: (destination: Destination) => void;
  setSearching: (searching: boolean) => void;
  setError: (error: string | null) => void;
  setResults: (results: MatchRow[], rejected: string[]) => void;
  toggle: (index: number) => void;
  setAll: (accepted: boolean) => void;
  /** Swap the chosen match for one of its alternates. */
  chooseAlternate: (index: number, uri: string) => void;
  setCreated: (created: WizardState["created"]) => void;
  reset: () => void;
};

const initial = {
  step: 1 as Step,
  sourceId: null,
  config: {},
  destination: "spotify" as Destination,
  results: [] as MatchRow[],
  rejected: [] as string[],
  searching: false,
  error: null,
  created: null,
};

export const useWizard = create<WizardState>((set) => ({
  ...initial,

  setStep: (step) => set({ step }),
  setSource: (sourceId) => set({ sourceId, config: {}, error: null }),
  setConfig: (config) => set({ config }),
  setDestination: (destination) => set({ destination }),
  setSearching: (searching) => set({ searching }),
  setError: (error) => set({ error, searching: false }),
  setResults: (results, rejected) =>
    set({ results, rejected, searching: false, error: null, step: 3 }),

  toggle: (index) =>
    set((state) => ({
      results: state.results.map((row) =>
        row.index === index ? { ...row, accepted: !row.accepted } : row,
      ),
    })),

  setAll: (accepted) =>
    set((state) => ({
      results: state.results.map((row) =>
        // Never mass-select rows we found nothing for.
        row.best ? { ...row, accepted } : row,
      ),
    })),

  chooseAlternate: (index, uri) =>
    set((state) => ({
      results: state.results.map((row) => {
        if (row.index !== index) return row;

        const chosen = row.alternates.find((alt) => alt.uri === uri);
        if (!chosen || !row.best) return row;

        // Swap: the old best becomes an alternate, so the choice is reversible.
        return {
          ...row,
          best: chosen,
          alternates: [
            row.best,
            ...row.alternates.filter((alt) => alt.uri !== uri),
          ],
          // An explicit human choice is trustworthy regardless of score.
          accepted: true,
        };
      }),
    })),

  setCreated: (created) => set({ created, step: 4 }),
  reset: () => set(initial),
}));
