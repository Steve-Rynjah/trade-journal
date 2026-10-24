import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Charts go up through Server Actions, and the 1 MB default turns away a
      // single retina screenshot. Six charts at the 5 MB cap, plus multipart
      // overhead.
      bodySizeLimit: "32mb",
    },
    // The proxy buffers every request body and truncates past 10 MB, which
    // would cut a multi-chart upload off before the action ever saw it.
    proxyClientMaxBodySize: "32mb",
  },
};

export default nextConfig;
