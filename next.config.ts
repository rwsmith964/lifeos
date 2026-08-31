import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Explicitly allowlist the production domain and Vercel's per-deploy
    // preview domains for Server Actions' built-in Origin/Host CSRF check
    // (see node_modules/next/dist/docs/.../guides/server-actions.md#security).
    // Investigating D-031 confirmed Origin and Host already matched
    // without this, so it wasn't the cause of that bug — kept anyway as
    // correct, low-risk belt-and-suspenders for preview deployments.
    serverActions: {
      allowedOrigins: ["lifeos-seven-rho.vercel.app", "*.vercel.app"],
    },
  },

  // D-108: response security headers. Vercel already adds a strong
  // Strict-Transport-Security header by default (verified in production),
  // so it's intentionally not duplicated here. The Supabase project URL
  // (NEXT_PUBLIC_SUPABASE_URL) is allowlisted in connect-src because
  // lib/db/client-browser.ts talks to it directly from the browser.
  // script-src/style-src need 'unsafe-inline' because Next.js's own App
  // Router hydration payload and critical-CSS injection rely on inline
  // <script>/<style> tags with no nonce wired up (that would need a
  // middleware.ts nonce pipeline, which is a bigger change than this
  // hardening pass calls for) -- every other directive is left strict.
  async headers() {
    const supabaseUrl = "https://moblcysnsaxohnslubym.supabase.co";
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      `connect-src 'self' ${supabaseUrl} wss://${new URL(supabaseUrl).host}`,
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
