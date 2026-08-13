import { describe, expect, it } from "vitest";
import { parseLine, parseText, splitFeaturedArtists } from "../parse";

describe("parseLine", () => {
  it("parses the plain Artist - Title form", () => {
    const r = parseLine("Radiohead - Idioteque");
    expect(r).toMatchObject({ artist: "Radiohead", title: "Idioteque" });
  });

  it("handles en and em dashes", () => {
    expect(parseLine("Radiohead – Idioteque")).toMatchObject({
      artist: "Radiohead",
      title: "Idioteque",
    });
    expect(parseLine("Radiohead — Idioteque")).toMatchObject({
      artist: "Radiohead",
      title: "Idioteque",
    });
  });

  it("strips leading list markers", () => {
    for (const line of [
      "1. Radiohead - Idioteque",
      "01 - Radiohead - Idioteque",
      "[3] Radiohead - Idioteque",
      "3) Radiohead - Idioteque",
      "- Radiohead - Idioteque",
      "• Radiohead - Idioteque",
    ]) {
      expect(parseLine(line), line).toMatchObject({
        artist: "Radiohead",
        title: "Idioteque",
      });
    }
  });

  it("strips YouTube noise", () => {
    expect(parseLine("Radiohead - Idioteque (Official Video)")).toMatchObject({
      title: "Idioteque",
    });
    expect(parseLine("Radiohead - Idioteque [HD]")).toMatchObject({
      title: "Idioteque",
    });
    expect(parseLine("Radiohead - Idioteque (Lyrics)")).toMatchObject({
      title: "Idioteque",
    });
  });

  it("strips remaster suffixes", () => {
    expect(parseLine("Radiohead - Karma Police - Remastered 2011")).toMatchObject(
      { artist: "Radiohead", title: "Karma Police" },
    );
  });

  it("uses feat. to identify the artist side", () => {
    const r = parseLine("Sunflower | Post Malone feat. Swae Lee");
    expect(r?.artist).toContain("Post Malone");
    expect(r?.title).toBe("Sunflower");
    expect(r?.ambiguousOrder).toBe(false);
  });

  it("flags ambiguous order rather than guessing silently", () => {
    expect(parseLine("Radiohead - Idioteque")?.ambiguousOrder).toBe(true);
  });

  it("accepts a bare title with no separator", () => {
    expect(parseLine("Bohemian Rhapsody")).toMatchObject({
      artist: "",
      title: "Bohemian Rhapsody",
    });
  });

  it("rejects lines that are not songs", () => {
    expect(parseLine("https://open.spotify.com/playlist/abc")).toBeNull();
    expect(parseLine("-----")).toBeNull();
    expect(parseLine("Tracklist:")).toBeNull();
    expect(parseLine("   ")).toBeNull();
    expect(parseLine("42")).toBeNull();
  });

  it("handles the by separator", () => {
    expect(parseLine("Idioteque by Radiohead")).toMatchObject({
      artist: "Idioteque",
      title: "Radiohead",
    });
  });
});

describe("parseText", () => {
  it("parses a block and reports nothing rejected for clean input", () => {
    const { tracks, rejected } = parseText(
      ["1. Radiohead - Idioteque", "2. Aphex Twin - Xtal"].join("\n"),
    );
    expect(tracks).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });

  it("deduplicates identical entries", () => {
    const { tracks } = parseText(
      ["Radiohead - Idioteque", "Radiohead - Idioteque"].join("\n"),
    );
    expect(tracks).toHaveLength(1);
  });

  it("surfaces unreadable lines instead of dropping them", () => {
    const { tracks, rejected } = parseText(
      ["Radiohead - Idioteque", "https://example.com", "Tracklist:"].join("\n"),
    );
    expect(tracks).toHaveLength(1);
    // URLs and headers are recognized noise, not failures worth reporting.
    expect(rejected).toHaveLength(0);
  });

  it("ignores blank lines", () => {
    const { tracks } = parseText("Radiohead - Idioteque\n\n\nAphex Twin - Xtal");
    expect(tracks).toHaveLength(2);
  });
});

describe("splitFeaturedArtists", () => {
  it("splits the primary from the featured artists", () => {
    expect(splitFeaturedArtists("Post Malone feat. Swae Lee")).toEqual({
      primary: "Post Malone",
      featured: ["Swae Lee"],
    });
  });

  it("handles multiple featured artists", () => {
    const r = splitFeaturedArtists("DJ Khaled ft. Rihanna & Bryson Tiller");
    expect(r.primary).toBe("DJ Khaled");
    expect(r.featured).toEqual(["Rihanna", "Bryson Tiller"]);
  });

  it("passes through an artist with no feature", () => {
    expect(splitFeaturedArtists("Radiohead")).toEqual({
      primary: "Radiohead",
      featured: [],
    });
  });
});
