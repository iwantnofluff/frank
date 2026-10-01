import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The default bottom-left spot sits on top of the rail's account avatar,
  // which made it unclickable in development.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
