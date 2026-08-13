import { describe, expect, it } from "vitest";
import { bucketOf, rankCandidates, scoreCandidate } from "../score";
import { query, track } from "./helpers";

describe("scoreCandidate", () => {
  it("scores an exact match at or near 1", () => {
    const r = scoreCandidate(
      query("Radiohead", "Idioteque"),
      track("Idioteque", "Radiohead"),
    );
    expect(r.score).toBeGreaterThan(0.95);
  });

  it("ignores remaster suffixes on the candidate", () => {
    const r = scoreCandidate(
      query("Radiohead", "Karma Police"),
      track("Karma Police - Remastered 2011", "Radiohead"),
    );
    expect(r.score).toBeGreaterThan(0.9);
  });

  it("matches any credited artist, not just the first", () => {
    const r = scoreCandidate(
      query("Dua Lipa", "One Kiss"),
      track("One Kiss", ["Calvin Harris", "Dua Lipa"]),
    );
    expect(r.score).toBeGreaterThan(0.9);
  });

  it("is case and diacritic insensitive", () => {
    const r = scoreCandidate(
      query("beyonce", "HALO"),
      track("Halo", "Beyoncé"),
    );
    expect(r.score).toBeGreaterThan(0.95);
  });

  describe("the karaoke trap", () => {
    // A karaoke upload has a near-identical title and would score ~1.0 without
    // the variant penalty. This is the single most common way an automatic
    // matcher quietly ruins a playlist.
    it("ranks the real track above a karaoke version", () => {
      const q = query("Radiohead", "Creep");
      const real = scoreCandidate(q, track("Creep", "Radiohead"));
      const karaoke = scoreCandidate(
        q,
        track("Creep (Karaoke Version)", "Karaoke Crew"),
      );
      expect(real.score).toBeGreaterThan(karaoke.score);
      expect(karaoke.penalties).toContain("karaoke");
    });

    it("penalizes 'in the style of' tribute uploads", () => {
      const r = scoreCandidate(
        query("Radiohead", "Creep"),
        track("Creep (In the Style of Radiohead)", "Tribute Band"),
      );
      expect(r.penalties).toContain("karaoke");
      expect(r.score).toBeLessThan(0.6);
    });
  });

  it("penalizes an unrequested live version", () => {
    const q = query("Nirvana", "Come As You Are");
    const studio = scoreCandidate(q, track("Come As You Are", "Nirvana"));
    const live = scoreCandidate(
      q,
      track("Come As You Are - Live", "Nirvana"),
    );
    expect(studio.score).toBeGreaterThan(live.score);
    expect(live.penalties).toContain("live");
  });

  it("does not penalize a live version when the query asked for one", () => {
    const r = scoreCandidate(
      query("Nirvana", "Come As You Are (Live)"),
      track("Come As You Are - Live", "Nirvana"),
    );
    expect(r.penalties).not.toContain("live");
    expect(r.score).toBeGreaterThan(0.8);
  });

  it("penalizes a remix when the query did not ask for one", () => {
    const r = scoreCandidate(
      query("Daft Punk", "One More Time"),
      track("One More Time - Kanye Remix", "Daft Punk"),
    );
    expect(r.penalties).toContain("remix");
  });

  it("returns 1 immediately on an ISRC match", () => {
    const r = scoreCandidate(
      query("Whoever", "Whatever", { isrc: "GBAYE0601498" }),
      track("Totally Different Name", "Someone Else", {
        external_ids: { isrc: "gbaye0601498" },
      }),
    );
    expect(r.score).toBe(1);
    expect(r.bonuses).toContain("isrc");
  });

  it("rewards a close duration and punishes a wildly different one", () => {
    const close = scoreCandidate(
      query("Radiohead", "Creep", { durationMs: 238_000 }),
      track("Creep", "Radiohead", { duration_ms: 239_000 }),
    );
    const far = scoreCandidate(
      query("Radiohead", "Creep", { durationMs: 238_000 }),
      track("Creep", "Radiohead", { duration_ms: 600_000 }),
    );
    expect(close.bonuses).toContain("duration");
    expect(far.penalties).toContain("duration-mismatch");
    expect(close.score).toBeGreaterThan(far.score);
  });

  it("penalizes a candidate whose credits omit the query artist", () => {
    const r = scoreCandidate(
      query("Radiohead", "Creep"),
      track("Creep", "Some Other Band"),
    );
    expect(r.penalties).toContain("artist-absent");
  });

  it("caps a title-only match below a full match", () => {
    const titleOnly = scoreCandidate(
      query("", "Idioteque"),
      track("Idioteque", "Radiohead"),
    );
    expect(titleOnly.score).toBeLessThanOrEqual(0.9);
  });

  it("scores a completely wrong candidate low", () => {
    const r = scoreCandidate(
      query("Radiohead", "Idioteque"),
      track("Baby Shark", "Pinkfong"),
    );
    expect(r.score).toBeLessThan(0.3);
  });

  it("handles non-Latin titles without false confidence", () => {
    const same = scoreCandidate(query("宇多田ヒカル", "光"), track("光", "宇多田ヒカル"));
    const different = scoreCandidate(
      query("宇多田ヒカル", "光"),
      track("桜流し", "宇多田ヒカル"),
    );
    expect(same.score).toBeGreaterThan(0.85);
    expect(different.score).toBeLessThan(same.score);
  });
});

describe("rankCandidates", () => {
  it("puts the best match first", () => {
    const ranked = rankCandidates(query("Radiohead", "Creep"), [
      track("Creep (Karaoke Version)", "Karaoke Crew"),
      track("Creep", "Radiohead"),
      track("Baby Shark", "Pinkfong"),
    ]);
    expect(ranked[0].track.name).toBe("Creep");
  });

  it("breaks near-ties toward the earlier release", () => {
    const ranked = rankCandidates(query("Radiohead", "Creep"), [
      track("Creep", "Radiohead", {
        album: {
          id: "reissue",
          name: "Greatest Hits",
          images: [],
          release_date: "2015-01-01",
          release_date_precision: "day",
        },
      }),
      track("Creep", "Radiohead", {
        album: {
          id: "original",
          name: "Pablo Honey",
          images: [],
          release_date: "1993-02-22",
          release_date_precision: "day",
        },
      }),
    ]);
    expect(ranked[0].track.album.name).toBe("Pablo Honey");
  });
});

describe("bucketOf", () => {
  it("maps scores to the PRD's three buckets", () => {
    expect(bucketOf(0.95)).toBe("high");
    expect(bucketOf(0.85)).toBe("high");
    expect(bucketOf(0.7)).toBe("medium");
    expect(bucketOf(0.6)).toBe("medium");
    expect(bucketOf(0.59)).toBe("low");
    expect(bucketOf(0)).toBe("low");
  });
});
