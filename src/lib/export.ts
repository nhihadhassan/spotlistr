"use client";

import Papa from "papaparse";
import type { MatchRow } from "./wizard-store";

/** Accepted rows only — never export something the user unchecked. */
function accepted(rows: MatchRow[]) {
  return rows.filter((row) => row.accepted && row.best);
}

export function toPlainText(rows: MatchRow[]): string {
  return accepted(rows)
    .map((row) => `${row.best!.artists} - ${row.best!.name}`)
    .join("\n");
}

export function toCsv(rows: MatchRow[]): string {
  return Papa.unparse(
    accepted(rows).map((row) => ({
      artist: row.best!.artists,
      title: row.best!.name,
      album: row.best!.album,
      spotify_uri: row.best!.uri,
      duration_ms: row.best!.durationMs,
      confidence: row.confidence.toFixed(3),
      original_input: row.raw,
    })),
  );
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
