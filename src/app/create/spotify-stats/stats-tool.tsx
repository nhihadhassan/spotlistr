"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { downloadPng, proxied } from "@/lib/dom-to-png";

type Item = {
  name: string;
  subtitle: string;
  image: string | null;
  uri: string;
};

const RANGES = [
  { value: "short_term", label: "Last 4 weeks" },
  { value: "medium_term", label: "Last 6 months" },
  { value: "long_term", label: "Last year" },
] as const;

const THEMES = {
  dark: { bg: "#09090b", fg: "#fafafa", muted: "#a1a1aa" },
  light: { bg: "#ffffff", fg: "#09090b", muted: "#71717a" },
  green: { bg: "#0b3d2c", fg: "#ffffff", muted: "#9fd8bf" },
} as const;

export function StatsTool() {
  const [type, setType] = useState<"tracks" | "artists">("tracks");
  const [range, setRange] = useState<string>("medium_term");
  const [count, setCount] = useState(5);
  const [theme, setTheme] = useState<keyof typeof THEMES>("dark");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          type,
          range,
          limit: String(count),
        });
        const res = await fetch(`/api/spotify/top?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Couldn't load your stats");
        if (!cancelled) setItems(json.items);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Couldn't load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [type, range, count]);

  const palette = THEMES[theme];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="type">Show</Label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as "tracks" | "artists")}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            <option value="tracks">Top tracks</option>
            <option value="artists">Top artists</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="range">Time period</Label>
          <select
            id="range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="count">How many</Label>
          <select
            id="count"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="theme">Theme</Label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as keyof typeof THEMES)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="green">Green</option>
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {items.length > 0 && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <div
              ref={cardRef}
              className="w-[420px] shrink-0 p-8"
              style={{ backgroundColor: palette.bg, color: palette.fg }}
            >
              <p
                className="text-xs font-medium uppercase tracking-widest"
                style={{ color: palette.muted }}
              >
                {RANGES.find((r) => r.value === range)?.label}
              </p>
              <h2 className="mt-1 mb-6 text-2xl font-semibold tracking-tight">
                My top {type}
              </h2>

              <ol className="space-y-3">
                {items.map((item, i) => (
                  <li key={item.uri} className="flex items-center gap-3">
                    <span
                      className="w-5 shrink-0 text-sm tabular-nums"
                      style={{ color: palette.muted }}
                    >
                      {i + 1}
                    </span>
                    {item.image && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={proxied(item.image)!}
                        alt=""
                        crossOrigin="anonymous"
                        className="h-10 w-10 shrink-0 object-cover"
                        style={{
                          borderRadius: type === "artists" ? "9999px" : "4px",
                        }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.name}
                      </p>
                      {item.subtitle && (
                        <p
                          className="truncate text-xs"
                          style={{ color: palette.muted }}
                        >
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <Button
            onClick={async () => {
              if (!cardRef.current) return;
              try {
                await downloadPng(cardRef.current, `my-top-${type}`);
              } catch {
                toast.error("Couldn't render the image.");
              }
            }}
          >
            Download PNG
          </Button>
        </div>
      )}
    </div>
  );
}
