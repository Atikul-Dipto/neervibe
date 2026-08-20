import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict Mode's dev-only double-invoke of effects tears down and rebuilds
  // the MapLibre WebGL context and both live WebSocket connections on every
  // mount, which is wasteful and was observed causing spurious "closed
  // before connection established" WS warnings. Production builds don't
  // double-invoke regardless, so this only affects dev-mode noise.
  reactStrictMode: false,
};

export default nextConfig;
