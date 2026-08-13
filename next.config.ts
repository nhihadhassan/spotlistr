import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Spotify album art. Note: for the Phase 5 canvas tools these must be
      // proxied through our own origin instead, or the canvas is CORS-tainted
      // and PNG export fails silently.
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "mosaic.scdn.co" },
      { protocol: "https", hostname: "image-cdn-ak.spotifycdn.com" },
      { protocol: "https", hostname: "image-cdn-fa.spotifycdn.com" },
      // YouTube thumbnails
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
};

export default nextConfig;
