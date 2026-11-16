import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Single-thread ffmpeg core: no SharedArrayBuffer, so no COOP/COEP headers.
  // Shortcut: forgiving headers only for the wasm assets.
  async headers() {
    return [
      {
        source: "/ffmpeg/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
