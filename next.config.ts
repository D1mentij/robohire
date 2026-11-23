import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e / demo:check run their own `next dev` with NEXT_DIST_DIR=.next-e2e: Next allows only one dev server per dist dir, so this never clashes with `npm run dev`
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
