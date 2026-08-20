import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel 部署不使用 standalone；自建 Docker 可设 OUTPUT_STANDALONE=1
  ...(process.env.OUTPUT_STANDALONE === "1" || (!process.env.VERCEL && process.env.NODE_ENV === "production")
    ? { output: "standalone" as const }
    : {}),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.siliconflow.cn" },
      { protocol: "https", hostname: "images.pexels.com" },
    ],
  },
};

export default nextConfig;
