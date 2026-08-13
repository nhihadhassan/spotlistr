import { NextResponse } from "next/server";

/**
 * Proxies album art through our own origin.
 *
 * Why this exists: the toolbox renders images client-side by rasterizing DOM
 * to PNG. Any remote image drawn into that canvas taints it, and the export
 * silently fails. Serving the art from our own origin avoids the taint.
 *
 * SECURITY: the host allowlist is the whole point. Without it this route is an
 * open proxy — anyone could use it to fetch internal network addresses through
 * our server (SSRF) or to launder traffic. Never widen it to a substring match
 * or a user-supplied host.
 */
const ALLOWED_HOSTS = new Set([
  "i.scdn.co",
  "mosaic.scdn.co",
  "image-cdn-ak.spotifycdn.com",
  "image-cdn-fa.spotifycdn.com",
  "lastfm.freetls.fastly.net",
  "i.ytimg.com",
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");

  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json(
      { error: "That host isn't allowed" },
      { status: 403 },
    );
  }

  const upstream = await fetch(parsed.toString(), {
    // Don't forward cookies or auth headers upstream.
    headers: { Accept: "image/*" },
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream returned ${upstream.status}` },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      // Album art is immutable; cache hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
