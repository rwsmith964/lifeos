import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";
import { ServiceWorkerRegistration } from "./service-worker-registration";
import { ThemeProvider } from "@/components/theme-provider";
import { PaletteProvider } from "@/components/palette-provider";
import { ToastProvider } from "@/components/ui/toast";

// Redesign (docs/redesign-brief.md Part 3): Manrope is the UI face (variable
// weight covers every role from Body/500 to Tag/800 in one load); Instrument
// Serif is used only for display headlines and figure-style numerals, never
// as a blanket default, so it's exposed as --font-serif and NOT mapped to
// Tailwind's generic --font-sans. Geist/Geist_Mono removed per the brief.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Never miss a gift. Never lose touch. One spine for the people in your life.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

// Every route in this app is session-dependent (auth state, household
// data), so nothing here is safe to statically prerender or CDN-cache.
// Next inferred /login as static (no dynamic API calls on its own render
// path) and Vercel's edge cached one of its Server Action responses — a
// stale "not signed in yet" redirect that then got replayed for every
// subsequent request to that action, regardless of the real caller's
// session, because a cacheable response variant existed at all. This was
// THE root cause behind every create/update Server Action ("Invalid UUID"
// in the QA brief) silently failing in production: requireHouseholdContext
// never even ran on the poisoned requests — Vercel served a cached
// response straight from its edge without invoking the function. See
// DECISIONS.md D-031.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <PaletteProvider defaultPalette="warm-evening-desk">
            <ToastProvider>
              {children}
              <ServiceWorkerRegistration />
            </ToastProvider>
          </PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
