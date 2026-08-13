"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadPng } from "@/lib/dom-to-png";

/**
 * Playlist cover maker.
 *
 * Covers are square everywhere that matters (Spotify, Apple Music, Tidal,
 * Deezer all use 1:1), so there's one canvas and the platform presets only
 * change the exported pixel size.
 */

const PRESETS = [
  { label: "Spotify (640)", size: 640 },
  { label: "Apple Music (1200)", size: 1200 },
  { label: "Tidal (1280)", size: 1280 },
  { label: "Small (300)", size: 300 },
] as const;

const FONTS = [
  { label: "Sans", value: "var(--font-sans), system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, 'SF Mono', Menlo, monospace" },
] as const;

const SHADOWS = {
  off: "none",
  soft: "0 2px 12px rgba(0,0,0,0.35)",
  strong: "0 4px 24px rgba(0,0,0,0.7)",
} as const;

export function CoverTool() {
  const [title, setTitle] = useState("late night");
  const [subtitle, setSubtitle] = useState("a playlist");
  const [bg, setBg] = useState("#1a1a2e");
  const [fg, setFg] = useState("#ffffff");
  const [font, setFont] = useState<string>(FONTS[0].value);
  const [fontSize, setFontSize] = useState(56);
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [letterSpacing, setLetterSpacing] = useState(-2);
  const [radius, setRadius] = useState(0);
  const [shadow, setShadow] = useState<keyof typeof SHADOWS>("soft");
  const [exportSize, setExportSize] = useState(640);
  const coverRef = useRef<HTMLDivElement>(null);

  // The canvas is a fixed 400px preview; export scales it up to the target.
  const PREVIEW = 400;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="overflow-hidden">
          <div
            ref={coverRef}
            className="flex flex-col justify-center p-10"
            style={{
              width: PREVIEW,
              height: PREVIEW,
              backgroundColor: bg,
              color: fg,
              fontFamily: font,
              textAlign: align,
              borderRadius: radius,
            }}
          >
            <p
              style={{
                fontSize,
                lineHeight: 1.05,
                letterSpacing: `${letterSpacing}px`,
                fontWeight: 600,
                textShadow: SHADOWS[shadow],
                overflowWrap: "anywhere",
              }}
            >
              {title}
            </p>
            {subtitle && (
              <p
                style={{
                  fontSize: Math.max(12, fontSize * 0.28),
                  marginTop: 12,
                  opacity: 0.75,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  textShadow: SHADOWS[shadow],
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <Button
          onClick={async () => {
            if (!coverRef.current) return;
            try {
              const { renderToPng } = await import("@/lib/dom-to-png");
              // Scale so the exported PNG lands at the chosen platform size.
              const dataUrl = await renderToPng(coverRef.current, {
                scale: exportSize / PREVIEW,
              });
              const link = document.createElement("a");
              link.href = dataUrl;
              link.download = `${title || "cover"}.png`;
              link.click();
            } catch {
              toast.error("Couldn't render the cover.");
            }
          }}
        >
          Download {exportSize}×{exportSize} PNG
        </Button>
        <p className="text-xs text-muted-foreground">
          Uploading straight to Spotify needs the <code>ugc-image-upload</code>{" "}
          scope, which we don&apos;t request yet — adding a scope forces every
          existing user to re-consent. Download and upload manually for now.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label="Subtitle">
          <Input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Background">
            <input
              type="color"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="h-10 w-full cursor-pointer rounded-lg border bg-background"
            />
          </Field>
          <Field label="Text">
            <input
              type="color"
              value={fg}
              onChange={(e) => setFg(e.target.value)}
              className="h-10 w-full cursor-pointer rounded-lg border bg-background"
            />
          </Field>
        </div>

        <Field label="Font">
          <select
            value={font}
            onChange={(e) => setFont(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {FONTS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Size — ${fontSize}px`}>
          <input
            type="range"
            min={20}
            max={110}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-full"
          />
        </Field>

        <Field label={`Letter spacing — ${letterSpacing}px`}>
          <input
            type="range"
            min={-6}
            max={12}
            value={letterSpacing}
            onChange={(e) => setLetterSpacing(Number(e.target.value))}
            className="w-full"
          />
        </Field>

        <Field label={`Corner radius — ${radius}px`}>
          <input
            type="range"
            min={0}
            max={80}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full"
          />
        </Field>

        <Field label="Alignment">
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setAlign(option)}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                  align === option ? "border-primary bg-primary/5" : "hover:bg-accent"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Text shadow">
          <div className="flex gap-1">
            {(Object.keys(SHADOWS) as Array<keyof typeof SHADOWS>).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setShadow(option)}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                  shadow === option ? "border-primary bg-primary/5" : "hover:bg-accent"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Export size">
          <select
            value={exportSize}
            onChange={(e) => setExportSize(Number(e.target.value))}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {PRESETS.map((preset) => (
              <option key={preset.size} value={preset.size}>
                {preset.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
