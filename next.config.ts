import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stage 0 skeleton config. `output: "standalone"` produces a self-contained
  // server build that the Dockerfile copies into a slim `runner` image.
  output: "standalone",
  // Local dev: proxy /api/* verbatim to the backend API (the API mounts every
  // route under /api per the interface contract). Mirrors nginx, which also
  // forwards /api/* without stripping the prefix: /api/keys → http://localhost:4000/api/keys.
  async rewrites() {
    if (process.env.NODE_ENV === "development") {
      return [
        {
          source: "/api/:path*",
          destination: `${process.env.API_INTERNAL_URL || "http://localhost:4000"}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
