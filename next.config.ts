import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next's dev-only indicator covers something in every corner: bottom-left
  // the account avatar, bottom-right the quick-add row's Save bar. Off —
  // compile and runtime errors still surface (per Next's own docs).
  devIndicators: false,
  // Local agency addresses (nofluff.frank.localhost:3000 — lib/tenant.ts)
  // talking to the dev server.
  allowedDevOrigins: ["frank.localhost", "*.frank.localhost"],
  // The test app (npm run test:local) builds into its own folder, so it
  // runs beside the dev server without either touching the other's files.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
