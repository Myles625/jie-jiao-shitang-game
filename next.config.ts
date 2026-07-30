import type { NextConfig } from "next";

/**
 * Static export for GitHub Pages (and any static host).
 * Project Pages base path is applied post-build by scripts/prepare-pages.mjs
 * because vinext prerender currently skips routes when next.config basePath is set.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
