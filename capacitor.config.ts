import type { CapacitorConfig } from '@capacitor/cli';

// LifeOS ships as a *hosted* Capacitor app: the WebView loads the live
// Next.js production deployment directly (server.url) rather than a static
// bundle. This is required because the app relies on Next.js Server Actions,
// server-rendered routes, and Supabase auth cookies that only work when
// served by the real Next.js server — a static `next export` bundle is not
// viable for this app. See APP-STORE-PLAN.md for the tradeoffs this implies
// for App Store review (Guideline 4.2) and how native plugins offset it.
const config: CapacitorConfig = {
  appId: 'com.rwsmith.lifeos',
  appName: 'LifeOS',
  webDir: 'public',
  server: {
    url: 'https://lifeos-seven-rho.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
