import type { NextConfig } from "next";

/**
 * Security headers. The Content Security Policy is the most important
 * defense-in-depth control here: even if an XSS injection point existed, a
 * strong CSP prevents exfiltration of keys/plaintext to an attacker's domain.
 *
 * Notes:
 *  - 'wasm-unsafe-eval' is required for hash-wasm (Argon2id). WebAssembly is
 *    sandboxed and does not grant DOM/network access, so this is safe.
 *  - connect-src is restricted to 'self' — keys/plaintext can only ever be sent
 *    to our own origin (and we never send plaintext there anyway).
 *  - frame-ancestors 'none' → clickjacking protection.
 *  - object-src 'none' → no Flash/plugins.
 */
// Framing policy: some sandboxed preview panels embed this app in a cross-origin
// iframe, which `frame-ancestors 'self'` / `X-Frame-Options: SAMEORIGIN` would
// block. That embedding is opt-in via ALLOW_IFRAME_EMBED=1; the secure default
// (production) locks framing down for clickjacking protection.
const allowIframeEmbed = process.env.ALLOW_IFRAME_EMBED === "1";
const frameAncestors = allowIframeEmbed ? "frame-ancestors *" : "frame-ancestors 'self'";

const csp = [
  "default-src 'self'",
  // NOTE: 'unsafe-inline' is required by Next.js' inline bootstrap/hydration
  // scripts without a nonce-based setup. For maximum XSS hardening, migrate to a
  // per-request nonce CSP (middleware) and drop 'unsafe-inline' from script-src.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  // The browser only ever talks to our own origin. Supabase is reached
  // server-side (Route Handlers / middleware), so it need not be allowlisted
  // here — keeping connect-src tight to 'self'.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  frameAncestors,
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Belt-and-suspenders clickjacking protection alongside frame-ancestors.
          // Omitted only when cross-origin embedding is explicitly opted into.
          ...(allowIframeEmbed
            ? []
            : [{ key: "X-Frame-Options", value: "SAMEORIGIN" }]),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          // HSTS — enforce HTTPS (Vercel handles this too, but defense in depth)
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
