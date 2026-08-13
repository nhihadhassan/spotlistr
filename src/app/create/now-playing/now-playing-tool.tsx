"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadPng, proxied } from "@/lib/dom-to-png";
import { cn } from "@/lib/utils";

type Track = {
  uri: string;
  name: string;
  artists: string;
  album: string;
  image: string | null;
  durationMs: number;
};

const DESIGNS = [
  { id: "card", label: "Card" },
  { id: "wide", label: "Wide" },
  { id: "poster", label: "Poster" },
] as const;

type Design = (typeof DESIGNS)[number]["id"];

export function NowPlayingTool() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [track, setTrack] = useState<Track | null>(null);
  const [design, setDesign] = useState<Design>("card");
  const [dark, setDark] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  // Debounced search — one request per pause in typing, not per keystroke.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(query)}`,
        );
        const json = await res.json();
        if (res.ok) setResults(json.tracks ?? []);
      } catch {
        // A failed keystroke search isn't worth interrupting the user over.
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const bg = dark ? "#09090b" : "#ffffff";
  const fg = dark ? "#fafafa" : "#09090b";
  const muted = dark ? "#a1a1aa" : "#71717a";

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="search">Find a song</Label>
        <Input
          id="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Spotify…"
        />

        {results.length > 0 && !track && (
          <ul className="divide-y rounded-lg border">
            {results.map((result) => (
              <li key={result.uri}>
                <button
                  type="button"
                  onClick={() => {
                    setTrack(result);
                    setResults([]);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  {result.image && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={proxied(result.image)!}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {result.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {result.artists}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {track && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {DESIGNS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setDesign(option.id)}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  design === option.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-accent",
                )}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              {dark ? "Dark" : "Light"}
            </button>
            <Button
              variant="outline"
              onClick={() => setTrack(null)}
              className="ml-auto"
            >
              Reset
            </Button>
          </div>

          <div className="overflow-x-auto">
            <div
              ref={cardRef}
              className={cn(
                "shrink-0 p-8",
                design === "card" && "w-[400px]",
                design === "wide" && "flex w-[560px] items-center gap-6",
                design === "poster" && "w-[400px]",
              )}
              style={{ backgroundColor: bg, color: fg }}
            >
              {track.image && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={proxied(track.image)!}
                  alt=""
                  crossOrigin="anonymous"
                  className={cn(
                    "block object-cover",
                    design === "wide" ? "h-32 w-32 shrink-0" : "w-full",
                  )}
                  style={{ borderRadius: design === "poster" ? "0" : "8px" }}
                />
              )}

              <div className={cn(design !== "wide" && "mt-5", "min-w-0")}>
                <p
                  className="text-xs font-medium uppercase tracking-widest"
                  style={{ color: muted }}
                >
                  Now playing
                </p>
                <p
                  className={cn(
                    "mt-2 font-semibold tracking-tight",
                    design === "poster" ? "text-3xl" : "text-xl",
                  )}
                >
                  {track.name}
                </p>
                <p className="mt-1 text-sm" style={{ color: muted }}>
                  {track.artists}
                </p>
                {design === "poster" && (
                  <p className="mt-4 text-xs" style={{ color: muted }}>
                    {track.album}
                  </p>
                )}
              </div>
            </div>
          </div>

          <Button
            onClick={async () => {
              if (!cardRef.current) return;
              try {
                await downloadPng(cardRef.current, `now-playing-${track.name}`);
              } catch {
                toast.error("Couldn't render the image.");
              }
            }}
          >
            Download PNG
          </Button>
        </>
      )}
    </div>
  );
}
