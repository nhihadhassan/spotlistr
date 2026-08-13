import { describe, expect, it } from "vitest";
import { extractPlaylistId } from "../youtube";
import { extractSpotifyPlaylistId } from "../spotify-playlist";
import { textboxSource } from "../textbox";

describe("extractPlaylistId (YouTube)", () => {
  it("reads the list parameter from a playlist URL", () => {
    expect(
      extractPlaylistId(
        "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
      ),
    ).toBe("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf");
  });

  it("reads it from a watch URL that also has a video id", () => {
    expect(
      extractPlaylistId(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest12345678",
      ),
    ).toBe("PLtest12345678");
  });

  it("handles a URL with no protocol", () => {
    expect(extractPlaylistId("youtube.com/playlist?list=PLtest12345678")).toBe(
      "PLtest12345678",
    );
  });

  it("accepts a bare playlist id", () => {
    expect(extractPlaylistId("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")).toBe(
      "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
    );
  });

  it("returns null when there is no playlist", () => {
    expect(
      extractPlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
    expect(extractPlaylistId("not a url")).toBeNull();
  });
});

describe("extractSpotifyPlaylistId", () => {
  it("reads an open.spotify.com URL", () => {
    expect(
      extractSpotifyPlaylistId(
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      ),
    ).toBe("37i9dQZF1DXcBWIGoYBM5M");
  });

  it("strips a share query string", () => {
    expect(
      extractSpotifyPlaylistId(
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123",
      ),
    ).toBe("37i9dQZF1DXcBWIGoYBM5M");
  });

  it("reads a spotify: URI", () => {
    expect(
      extractSpotifyPlaylistId("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"),
    ).toBe("37i9dQZF1DXcBWIGoYBM5M");
  });

  it("accepts a bare id", () => {
    expect(extractSpotifyPlaylistId("37i9dQZF1DXcBWIGoYBM5M")).toBe(
      "37i9dQZF1DXcBWIGoYBM5M",
    );
  });

  it("returns null for junk", () => {
    expect(extractSpotifyPlaylistId("hello")).toBeNull();
  });
});

describe("textbox source", () => {
  it("parses a pasted list into tracks", async () => {
    const result = await textboxSource.fetch({
      text: "Radiohead - Idioteque\n1. Aphex Twin - Xtal",
    });
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]).toMatchObject({
      artist: "Radiohead",
      title: "Idioteque",
    });
  });

  it("rejects empty input at the schema level", () => {
    expect(textboxSource.configSchema.safeParse({ text: "" }).success).toBe(
      false,
    );
  });
});
