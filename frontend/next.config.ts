import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict Mode's dev-only double-invoke of effects tears down and rebuilds
  // the MapLibre WebGL context and both live WebSocket connections on every
  // mount, which is wasteful and was observed causing spurious "closed
  // before connection established" WS warnings. Production builds don't
  // double-invoke regardless, so this only affects dev-mode noise.
  reactStrictMode: false,
  // The dev server rejects requests whose Host header it doesn't recognize
  // (DNS-rebinding protection), which 403s every asset when accessed through
  // a tunnel. Quick-tunnel hostnames are random per run, so this needs
  // updating whenever the tunnel is restarted — see README's tunnel note.
  allowedDevOrigins: ["port-streets-whose-westminster.trycloudflare.com"],
};

export default nextConfig;
