import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appRoot, "../..");

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot,
  },
  logging: {
    incomingRequests: {
      ignore: [/\/access\/(?:verify|manage)(?:\?|$)/],
    },
  },
  async headers() {
    const securityHeaders = [
      { key: "Content-Security-Policy", value: "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      ...(process.env.APP_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
    ];
    const privateHeaders = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ];

    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/verify", headers: privateHeaders },
      { source: "/confirmed", headers: privateHeaders },
      { source: "/manage/:path*", headers: privateHeaders },
      { source: "/access/:path*", headers: privateHeaders },
      { source: "/api/secure/:path*", headers: privateHeaders },
      { source: "/api/internal/:path*", headers: privateHeaders },
      { source: "/api/health/:path*", headers: privateHeaders },
    ];
  },
};

export default nextConfig;
