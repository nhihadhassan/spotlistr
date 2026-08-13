"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadPng, proxied } from "@/lib/dom-to-png";

type Album = {
  name: string;
  artist: string;
  playcount: number;
  image: string | null;
};

const PERIODS = [
  { value: "7day", label: "Last 7 days" },
  { value: "1month", label: "Last month" },
  { value: "3month", label: "Last 3 months" },
  { value: "6month", label: "Last 6 months" },
  { value: "12month", label: "Last year" },
  { value: "overall", label: "All time" },
] as const;

const SIZES = [3, 4, 5, 6, 8, 10] as const;

export function GridTool() {
  const [username, setUsername] = useState("");
  const [period, setPeriod] = useState<string>("7day");
  const [size, setSize] = useState<number>(3);
  const [showTitles, setShowTitles] = useState(true);
  const [showPlays, setShowPlays] = useState(false);
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!username.trim()) {
      toast.error("Enter a Last.fm username");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        user: username.trim(),
        period,
        limit: String(size * size),
      });
      const res = await fetch(`/api/lastfm/top-albums?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load albums");

      if (json.albums.length === 0) {
        toast.error("That account has no scrobbles for this period");
        setAlbums(null);
        return;
      }
      setAlbums(json.albums);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load albums");
      setAlbums(null);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!gridRef.current) return;
    setExporting(true);
    try {
      await downloadPng(gridRef.current, `${username}-${period}-${size}x${size}`);
    } catch {
      toast.error("Couldn't render the image. Try a smaller grid.");
    } finally {
      setExporting(false);
    }
  }

  const cells = albums?.slice(0, size * size) ?? [];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="username">Last.fm username</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="rj"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="period">Time period</Label>
          <select
            id="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div className="space-y-2">
          <Label htmlFor="size">Grid size</Label>
          <select
            id="size"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="h-10 rounded-lg border bg-background px-3 text-sm"
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s} × {s}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <Checkbox
            checked={showTitles}
            onCheckedChange={(v) => setShowTitles(v === true)}
          />
          Show titles
        </label>

        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <Checkbox
            checked={showPlays}
            onCheckedChange={(v) => setShowPlays(v === true)}
          />
          Show play counts
        </label>

        <Button onClick={load} disabled={loading} className="ml-auto">
          {loading ? "Loading…" : "Get top albums"}
        </Button>
      </div>

      {cells.length > 0 && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <div
              ref={gridRef}
              className="grid w-fit bg-black"
              style={{
                gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
              }}
            >
              {cells.map((album, i) => (
                <div
                  key={`${album.artist}-${album.name}-${i}`}
                  className="relative"
                  style={{ width: `${Math.max(72, 640 / size)}px` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proxied(album.image) ?? "/album-placeholder.svg"}
                    alt=""
                    className="block aspect-square w-full object-cover"
                    crossOrigin="anonymous"
                  />
                  {(showTitles || showPlays) && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-6">
                      {showTitles && (
                        <>
                          <p
                            className="truncate font-medium leading-tight text-white"
                            style={{ fontSize: `${Math.max(7, 40 / size)}px` }}
                          >
                            {album.artist}
                          </p>
                          <p
                            className="truncate leading-tight text-white/75"
                            style={{ fontSize: `${Math.max(6, 34 / size)}px` }}
                          >
                            {album.name}
                          </p>
                        </>
                      )}
                      {showPlays && (
                        <p
                          className="truncate text-white/60"
                          style={{ fontSize: `${Math.max(6, 32 / size)}px` }}
                        >
                          {album.playcount} plays
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={exporting}>
              {exporting ? "Rendering…" : "Download PNG"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
