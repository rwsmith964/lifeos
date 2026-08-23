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
};

export default nextConfig;
