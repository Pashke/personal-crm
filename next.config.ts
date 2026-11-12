import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy without nonces: inline scripts and styles are allowed, everything else
// must come from the app itself. Next.js puts the fonts next to the app at build time, so no other
// origin is needed. `next dev` also needs 'unsafe-eval': React uses eval there for debugging.
// No upgrade-insecure-requests: every resource is already our own over https, and on
// http://localhost it would break loading.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Security headers on every response of the app: pages, API, /health, build files.
// nginx on the server adds none of its own.
const securityHeaders = [
  // https only, for 2 years. Browsers ignore it on plain http (localhost, e2e).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // No framing: frame-ancestors above for current browsers, this header for old ones.
  { key: "X-Frame-Options", value: "DENY" },
  // Other sites get only the origin, never the path or the query.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only features browsers know: an unknown name is an error in the browser console.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // The app does not name its software: no "X-Powered-By: Next.js".
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
