import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next's dev-only indicator covers something in every corner: bottom-left
  // the account avatar, bottom-right the quick-add row's Save bar. Off —
  // compile and runtime errors still surface (per Next's own docs).
  devIndicators: false,
};

export default nextConfig;
