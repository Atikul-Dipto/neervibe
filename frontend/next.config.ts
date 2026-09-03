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
  // Proxies REST calls to the live backend server-side so the browser only
  // ever talks to this same-origin dev server — sidesteps CORS entirely
  // instead of needing the backend's CORS_ORIGINS to list every dev
  // machine. Doesn't cover WebSockets (Next.js rewrites don't proxy the
  // upgrade handshake); those still connect directly and aren't subject to
  // CORS the way fetch/XHR are.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "https://neervibe-backend.onrender.com/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
