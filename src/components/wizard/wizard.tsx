"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrackReviewRow } from "./track-review-row";
import { useWizard, type MatchRow } from "@/lib/wizard-store";
import { toCsv, toPlainText, download } from "@/lib/export";
import { cn } from "@/lib/utils";

type SourceDescriptor = {
  id: string;
  label: string;
  description: string;
  authRequired: string;
  input: {
    kind: "textarea" | "url" | "playlist-picker";
    label: string;
    placeholder?: string;
    help?: string;
  };
};

type Playlist = { id: string; name: string; trackCount: number };

const STEPS = ["Input", "Output", "Review", "Create"] as const;

export function Wizard({
  sources,
  playlists,
}: {
  sources: SourceDescriptor[];
  playlists: Playlist[];
}) {
  const state = useWizard();
  const source = sources.find((s) => s.id === state.sourceId);

  return (
    <div className="space-y-8">
      <StepIndicator step={state.step} />

      {state.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium text-destructive">{state.error}</span>
        </div>
      )}

      {state.step === 1 && (
        <StepInput sources={sources} source={source} playlists={playlists} />
      )}
      {state.step === 2 && <StepOutput playlists={playlists} />}
      {state.step === 3 && <StepReview />}
      {state.step === 4 && <StepDone />}
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const active = number === step;
        const done = number < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                active && "bg-primary text-primary-foreground",
                done && "bg-primary/20 text-primary",
                !active && !done && "bg-muted text-muted-foreground",
              )}
            >
              {number}
            </span>
            <span className={cn(!active && "text-muted-foreground")}>
              {label}
            </span>
            {number < STEPS.length && (
              <span className="mx-1 text-muted-foreground/40">/</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepInput({
  sources,
  source,
  playlists,
}: {
  sources: SourceDescriptor[];
  source: SourceDescriptor | undefined;
  playlists: Playlist[];
}) {
  const { sourceId, setSource, config, setConfig, setStep } = useWizard();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Where is your music now?</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {sources.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSource(option.id)}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                sourceId === option.id
                  ? "border-primary bg-primary/5"
                  : "hover:bg-accent",
              )}
            >
              <span className="block font-medium">{option.label}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {source && (
        <div className="space-y-2">
          <Label htmlFor="source-input">{source.input.label}</Label>

          {source.input.kind === "textarea" && (
            <Textarea
              id="source-input"
              rows={10}
              placeholder={source.input.placeholder}
              value={(config.text as string) ?? ""}
              onChange={(e) => setConfig({ text: e.target.value })}
              className="font-mono text-sm"
            />
          )}

          {source.input.kind === "url" && (
            <Input
              id="source-input"
              placeholder={source.input.placeholder}
              value={(config.url as string) ?? ""}
              onChange={(e) => setConfig({ url: e.target.value })}
            />
          )}

          {source.input.kind === "playlist-picker" && (
            <select
              id="source-input"
              value={(config.playlistId as string) ?? ""}
              onChange={(e) => setConfig({ playlistId: e.target.value })}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="">Choose a playlist…</option>
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name} ({playlist.trackCount})
                </option>
              ))}
            </select>
          )}

          {source.input.help && (
            <p className="text-xs text-muted-foreground">{source.input.help}</p>
          )}
        </div>
      )}

      <Button
        disabled={!source || Object.keys(config).length === 0}
        onClick={() => setStep(2)}
      >
        Continue
      </Button>
    </div>
  );
}

function StepOutput({ playlists }: { playlists: Playlist[] }) {
  const {
    destination,
    setDestination,
    setStep,
    sourceId,
    config,
    setSearching,
    setResults,
    setError,
    searching,
  } = useWizard();

  async function search() {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/convert/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, config }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");

      if (json.results.length === 0) {
        setError("We couldn't read any songs out of that input.");
        return;
      }
      setResults(json.results as MatchRow[], json.rejected ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Where should it go?</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setDestination("spotify")}
            className={cn(
              "rounded-lg border p-4 text-left transition-colors",
              destination === "spotify"
                ? "border-primary bg-primary/5"
                : "hover:bg-accent",
            )}
          >
            <span className="block font-medium">A Spotify playlist</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Create a new one or add to an existing playlist
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDestination("export")}
            className={cn(
              "rounded-lg border p-4 text-left transition-colors",
              destination === "export"
                ? "border-primary bg-primary/5"
                : "hover:bg-accent",
            )}
          >
            <span className="block font-medium">Export a file</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Plain text or CSV — nothing is written to Spotify
            </span>
          </button>
        </div>
        {playlists.length === 0 && destination === "spotify" && (
          <p className="mt-2 text-xs text-muted-foreground">
            You have no playlists yet — we&apos;ll create a new one.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(1)}>
          Back
        </Button>
        <Button onClick={search} disabled={searching}>
          {searching ? "Searching Spotify…" : "Find these songs"}
        </Button>
      </div>

      {searching && (
        <p className="text-sm text-muted-foreground">
          Searching is free — you only ever pay for songs actually added.
        </p>
      )}
    </div>
  );
}

function StepReview() {
  const { results, rejected, setAll, setStep, destination } = useWizard();

  const stats = useMemo(() => {
    const accepted = results.filter((r) => r.accepted && r.best).length;
    const unmatched = results.filter((r) => !r.best).length;
    const low = results.filter((r) => r.bucket === "low" && r.best).length;
    return { accepted, unmatched, low };
  }, [results]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">
            {stats.accepted} of {results.length} selected
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.unmatched > 0 && `${stats.unmatched} not found. `}
            {stats.low > 0 &&
              `${stats.low} low-confidence, left off by default. `}
            Nothing is added until you press the button below.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAll(true)}>
            Select all
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAll(false)}>
            Clear
          </Button>
        </div>
      </div>

      <ul className="divide-y rounded-lg border">
        {results.map((row) => (
          <TrackReviewRow key={row.index} row={row} />
        ))}
      </ul>

      {rejected.length > 0 && (
        <details className="rounded-lg border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            {rejected.length} line{rejected.length === 1 ? "" : "s"} we
            couldn&apos;t read
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {rejected.map((line, i) => (
              <li key={i} className="truncate font-mono text-xs">
                {line}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(2)}>
          Back
        </Button>
        {destination === "spotify" ? <CreateButton /> : <ExportButtons />}
      </div>
    </div>
  );
}

function CreateButton() {
  const { results, setCreated, setError } = useWizard();
  const [name, setName] = useState("New playlist");
  const [busy, setBusy] = useState(false);

  const uris = results
    .filter((r) => r.accepted && r.best)
    .map((r) => r.best!.uri);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/convert/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uris, playlistName: name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't create the playlist");

      setCreated({ url: json.url, name: json.playlistName, added: json.added });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create playlist");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Playlist name"
        className="max-w-xs"
      />
      <Button onClick={create} disabled={busy || uris.length === 0}>
        {busy ? "Creating…" : `Create with ${uris.length} songs`}
      </Button>
    </div>
  );
}

function ExportButtons() {
  const results = useWizard((s) => s.results);
  const count = results.filter((r) => r.accepted && r.best).length;

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        disabled={count === 0}
        onClick={async () => {
          await navigator.clipboard.writeText(toPlainText(results));
          toast.success(`Copied ${count} songs`);
        }}
      >
        Copy as text
      </Button>
      <Button
        disabled={count === 0}
        onClick={() =>
          download("playlist.csv", toCsv(results), "text/csv")
        }
      >
        Download CSV
      </Button>
    </div>
  );
}

function StepDone() {
  const { created, reset } = useWizard();
  if (!created) return null;

  return (
    <div className="space-y-6 rounded-lg border p-8 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {created.name} is ready
        </h2>
        <p className="text-muted-foreground">
          {created.added} song{created.added === 1 ? "" : "s"} added.
        </p>
      </div>
      <div className="flex justify-center gap-2">
        <a
          href={created.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Open in Spotify
        </a>
        <Button variant="outline" onClick={reset}>
          Convert another
        </Button>
      </div>
    </div>
  );
}
