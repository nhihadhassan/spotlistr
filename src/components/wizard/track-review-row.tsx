"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ConfidencePill } from "./confidence-pill";
import { useWizard, type MatchRow } from "@/lib/wizard-store";
import { cn } from "@/lib/utils";

function duration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function TrackReviewRow({ row }: { row: MatchRow }) {
  const toggle = useWizard((s) => s.toggle);
  const chooseAlternate = useWizard((s) => s.chooseAlternate);

  if (!row.best) {
    return (
      <li className="flex items-start gap-3 px-4 py-3 opacity-70">
        <div className="w-4" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{row.raw}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            No match found on Spotify
          </p>
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-opacity",
        !row.accepted && "opacity-55",
      )}
    >
      <Checkbox
        checked={row.accepted}
        onCheckedChange={() => toggle(row.index)}
        className="mt-1"
        aria-label={`Include ${row.best.name}`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-medium">{row.best.name}</p>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {duration(row.best.durationMs)}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {row.best.artists}
        </p>
        {/* Always show what we read, so a bad parse is visible rather than mysterious. */}
        <p className="mt-1 truncate text-xs text-muted-foreground/70">
          from “{row.raw}”
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ConfidencePill confidence={row.confidence} bucket={row.bucket} />

        {row.alternates.length > 0 && (
          <Popover>
            <PopoverTrigger className="rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-accent">
              Not this?
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-1">
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Pick the right one
              </p>
              <ul>
                {row.alternates.map((alt) => (
                  <li key={alt.uri}>
                    <button
                      type="button"
                      onClick={() => chooseAlternate(row.index, alt.uri)}
                      className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                    >
                      <span className="block truncate text-sm">{alt.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {alt.artists} · {alt.album}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </li>
  );
}
